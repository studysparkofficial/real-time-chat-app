import { useState, useEffect, useRef, useCallback } from 'react';
import {
  db,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp
} from '../services/firebase';
import { localCache } from '../services/indexedDbCache';
import {
  extractKeyFromS3Url,
  inferAttachmentCategory,
  isOpenableS3Url
} from '../services/s3Service';
import {
  ChatMessage,
  ChatUser,
  MessageAttachment,
  MessageReplyReference
} from '../types/chat.types';

function toMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function durableFileUrl(url?: string): string {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return '';
  return isOpenableS3Url(url) ? url : '';
}

function normalizeAttachment(raw: Record<string, unknown> | null | undefined): MessageAttachment | null {
  if (!raw || typeof raw !== 'object') return null;
  const fileName = String(raw.fileName || raw.name || 'attachment');
  const mimeType = String(raw.mimeType || raw.type || 'application/octet-stream');
  const size = Number(raw.fileSize || raw.size || 0);
  const rawUrl = typeof raw.url === 'string' ? raw.url : undefined;
  const rawDownloadUrl = typeof raw.downloadUrl === 'string' ? raw.downloadUrl : undefined;
  const url = durableFileUrl(rawUrl) || durableFileUrl(rawDownloadUrl);
  const key = (typeof raw.key === 'string' ? raw.key : '')
    || extractKeyFromS3Url(rawUrl)
    || extractKeyFromS3Url(rawDownloadUrl);
  if (!key && !url) return null;
  const category = (['image', 'video', 'audio', 'pdf', 'file'].includes(String(raw.category))
    ? raw.category
    : inferAttachmentCategory(mimeType, fileName)) as MessageAttachment['category'];
  return {
    key,
    url,
    downloadUrl: url,
    fileName,
    name: fileName,
    fileSize: size,
    size,
    mimeType,
    type: mimeType,
    category
  };
}

function storedAttachment(attachment: MessageAttachment): MessageAttachment {
  const url = durableFileUrl(attachment.downloadUrl) || durableFileUrl(attachment.url);
  const fileName = attachment.fileName || attachment.name || 'attachment';
  const mimeType = attachment.mimeType || attachment.type || 'application/octet-stream';
  const size = attachment.fileSize || attachment.size || 0;
  return {
    key: attachment.key || extractKeyFromS3Url(attachment.url) || extractKeyFromS3Url(attachment.downloadUrl),
    url,
    downloadUrl: url,
    fileName,
    name: attachment.name || fileName,
    fileSize: size,
    size,
    mimeType,
    type: attachment.type || mimeType,
    category: attachment.category || inferAttachmentCategory(mimeType, fileName)
  };
}

function firestoreMessagePayload(message: ChatMessage): Record<string, unknown> {
  return {
    text: message.text,
    sender: {
      uid: message.sender.uid,
      displayName: message.sender.displayName || 'Scholar',
      photoURL: message.sender.photoURL || null,
      isAnonymous: Boolean(message.sender.isAnonymous)
    },
    timestamp: message.timestamp,
    createdAt: serverTimestamp(),
    reactions: message.reactions || {},
    clientTempId: message.clientTempId || message.id,
    attachment: message.attachment?.key ? storedAttachment(message.attachment) : null,
    replyTo: message.replyTo || null
  };
}

async function persistMessage(message: ChatMessage): Promise<void> {
  const messageId = `msg_${message.clientTempId || message.id}`;
  const messageRef = doc(db, `rooms/${message.roomId}/messages`, messageId);
  await setDoc(messageRef, firestoreMessagePayload(message));
}

function dedupeMessages(list: ChatMessage[]): ChatMessage[] {
  const byKey = new Map<string, ChatMessage>();
  for (const msg of list) {
    const key = msg.clientTempId || msg.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, msg);
      continue;
    }
    const existingIsLocal = Boolean(existing.isOptimistic);
    const incomingIsLocal = Boolean(msg.isOptimistic);
    if (existingIsLocal && !incomingIsLocal) byKey.set(key, msg);
    else if (!existingIsLocal && incomingIsLocal) byKey.set(key, existing);
    else byKey.set(key, msg);
  }
  return Array.from(byKey.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

export function useMessages(
  roomId: string,
  currentUser: ChatUser | null,
  onAudioSent?: () => void,
  onAudioReceived?: () => void,
  onHaptic?: () => void
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [initialLoading, setInitialLoading] = useState<boolean>(true);

  // Keep track of optimistic local messages waiting for remote confirmation
  const optimisticMapRef = useRef<Map<string, ChatMessage>>(new Map());
  const hasMountedRef = useRef(false);

  // Monitor online / offline network state. Outbox flushing is handled below so
  // it always uses the current room and authenticated user.
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Flush queued outbox messages upon reconnect
  const flushOutbox = useCallback(async () => {
    const pending = await localCache.getOutbox();
    if (pending.length === 0) return;

    for (const msg of pending) {
      if (currentUser && msg.sender.uid === currentUser.uid) {
        try {
          await persistMessage(msg);

          await localCache.removeFromOutbox(msg.clientTempId!);
          optimisticMapRef.current.delete(msg.clientTempId!);

          setMessages((prev) =>
            prev.map((m) =>
              m.clientTempId === msg.clientTempId && m.status !== 'delivered'
                ? { ...m, status: 'sent' }
                : m
            )
          );
        } catch {
          // Will retry on next reconnect
        }
      }
    }
  }, [currentUser]);

  useEffect(() => {
    if (isOnline && currentUser) void flushOutbox();
  }, [isOnline, currentUser, flushOutbox]);

  // Cold Boot from IndexedDB Cache (< 50ms) + Real-time Firestore Stream.
  // The listener is created only after sign-in. Starting it earlier is denied by
  // security rules and Firestore does not retry that listener, so messages never arrive.
  useEffect(() => {
    if (!currentUser?.uid) {
      setMessages([]);
      setInitialLoading(false);
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let isCurrentRoom = true;
    hasMountedRef.current = false;
    setMessages([]);
    setInitialLoading(true);

    // 1. Instant cold boot from local IndexedDB cache
    localCache.getCachedMessages(roomId, 100).then((cached) => {
      if (!isCurrentRoom) return;
      if (cached && cached.length > 0) {
        const pendingLocal = Array.from(optimisticMapRef.current.values()).filter(
          (message) => message.roomId === roomId && message.sender.uid === currentUser.uid
        );
        setMessages(dedupeMessages([...cached, ...pendingLocal]));
        setInitialLoading(false);
      }
    });

    // 2. Real-time Firestore listener with metadata changes enabled
    const messagesRef = collection(db, `rooms/${roomId}/messages`);
    // Read the newest page, then reverse it for the ascending chat timeline.
    const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(150));

    unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!isCurrentRoom) return;

        const remoteList: ChatMessage[] = [];
        let hasNewIncoming = false;
        const newlyAddedIds = new Set(
          snapshot.docChanges().filter((change) => change.type === 'added').map((change) => change.doc.id)
        );

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const docMetadata = docSnap.metadata;

          // Legacy messages stored a numeric timestamp; newer writes may use a
          // Firestore Timestamp on timestamp or createdAt.
          const ts = toMillis(data.timestamp) || toMillis(data.createdAt) || Date.now();

          // If Firestore is still uploading local writes, status is 'sent' (single check)
          // Once synced to cloud server without pending writes, it's 'delivered' (double check)
          const isPending = docMetadata.hasPendingWrites;
          const status: ChatMessage['status'] = isPending ? 'sent' : 'delivered';

          const rawSender = (data.sender || {}) as {
            uid?: string;
            displayName?: string;
            username?: string;
            photoURL?: string | null;
            avatar?: string | null;
            isAnonymous?: boolean;
          };
          const normalizedAttachment = normalizeAttachment(data.attachment);

          const msg: ChatMessage = {
            id: docSnap.id,
            roomId: data.roomId || roomId,
            text: data.text || '',
            sender: {
              uid: rawSender.uid || data.senderId || 'unknown',
              displayName: rawSender.displayName || rawSender.username || 'Anonymous',
              photoURL: rawSender.photoURL || rawSender.avatar || null,
              isAnonymous: Boolean(rawSender.isAnonymous)
            },
            timestamp: ts,
            status,
            attachment: normalizedAttachment,
            reactions: data.reactions || {},
            replyTo: data.replyTo || null,
            clientTempId: data.clientTempId || data.clientMsgId,
            isOptimistic: false
          };

          const tempId = data.clientTempId || data.clientMsgId;
          if (tempId && optimisticMapRef.current.has(tempId) && !docMetadata.hasPendingWrites) {
            optimisticMapRef.current.delete(tempId);
            localCache.removeFromOutbox(tempId);
          }

          // Check if it's an incoming message from someone else
          if (
            hasMountedRef.current &&
            currentUser &&
            !snapshot.metadata.fromCache &&
            newlyAddedIds.has(docSnap.id) &&
            (rawSender.uid || data.senderId) !== currentUser.uid &&
            !docMetadata.fromCache
          ) {
            hasNewIncoming = true;
          }

          remoteList.push(msg);
        });

        remoteList.reverse();

        // Merge any remaining optimistic messages that haven't hit the listener yet
        const remainingOptimistic = Array.from(optimisticMapRef.current.values()).filter(
          (m) => m.roomId === roomId && m.sender.uid === currentUser.uid
        );

        const merged = dedupeMessages([...remoteList, ...remainingOptimistic]);

        setMessages(merged);
        setInitialLoading(false);

        // Async write to IndexedDB for next cold boot
        if (remoteList.length > 0) {
          localCache.cacheMessages(remoteList);
        }

        if (hasNewIncoming && onAudioReceived) {
          onAudioReceived();
        }

        if (!snapshot.metadata.fromCache) hasMountedRef.current = true;
      },
      (error) => {
        console.warn(`[Firestore] Messages stream subscription error in #${roomId}:`, error);
        setInitialLoading(false);
      }
    );

    return () => {
      isCurrentRoom = false;
      if (unsubscribe) unsubscribe();
    };
  }, [roomId, currentUser?.uid, onAudioReceived]);

  // Send a text or already-uploaded attachment with optimistic UI and outbox queueing.
  const sendMessage = useCallback(
    async (
      text: string,
      attachment?: MessageAttachment | null,
      replyTo?: MessageReplyReference | null
    ) => {
      if ((!text || !text.trim()) && !attachment) return;
      if (!currentUser) return;

      const clientTempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const optimisticMsg: ChatMessage = {
        id: `msg_${clientTempId}`,
        roomId,
        text: text.trim(),
        sender: {
          uid: currentUser.uid,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          isAnonymous: currentUser.isAnonymous
        },
        timestamp: Date.now(),
        status: 'sending', // Clock icon (🕒)
        attachment: attachment || null,
        reactions: {},
        replyTo: replyTo || null,
        clientTempId,
        isOptimistic: true
      };

      // 1. Immediately render message in UI (Zero lag)
      optimisticMapRef.current.set(clientTempId, optimisticMsg);
      setMessages((prev) => [...prev, optimisticMsg]);

      // 2. Play audio & trigger subtle vibration
      if (onAudioSent) onAudioSent();
      if (onHaptic) onHaptic();

      // 3. Queue in IndexedDB Outbox
      await localCache.enqueueOutbox(optimisticMsg);

      // 4. If offline, keep it in the outbox until the connection returns.
      if (!isOnline) {
        return;
      }

      try {
        await persistMessage(optimisticMsg);
        await localCache.removeFromOutbox(clientTempId);

        // Update optimistic item to 'sent' (✓) until remote confirms 'delivered' (✓✓)
        setMessages((prev) =>
          prev.map((m) =>
            m.clientTempId === clientTempId && m.status !== 'delivered'
              ? { ...m, status: 'sent' }
              : m
          )
        );
      } catch (err: unknown) {
        const error = err as Error;
        console.error('[Messages] Send error:', error);
        // Mark as failed with 1-tap retry button
        optimisticMsg.status = 'failed';
        optimisticMsg.errorMessage = error.message || 'Failed to send message';
        optimisticMapRef.current.set(clientTempId, optimisticMsg);

        setMessages((prev) =>
          prev.map((m) =>
            m.clientTempId === clientTempId ? { ...m, status: 'failed', errorMessage: error.message } : m
          )
        );
      }
    },
    [roomId, currentUser, isOnline, onAudioSent, onHaptic]
  );

  // Show a file message immediately, then let S3 upload and Firestore delivery
  // finish in the background while the composer remains available.
  const beginAttachmentUpload = useCallback(
    (
      text: string,
      attachment: MessageAttachment,
      replyTo?: MessageReplyReference | null
    ): string | null => {
      if (!currentUser) return null;

      const clientTempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const optimisticMsg: ChatMessage = {
        id: `msg_${clientTempId}`,
        roomId,
        text: text.trim(),
        sender: {
          uid: currentUser.uid,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          isAnonymous: currentUser.isAnonymous
        },
        timestamp: Date.now(),
        status: 'sending',
        attachment: { ...attachment, uploadState: 'uploading', uploadProgress: 0, retryAvailable: true },
        reactions: {},
        replyTo: replyTo || null,
        clientTempId,
        isOptimistic: true
      };

      optimisticMapRef.current.set(clientTempId, optimisticMsg);
      setMessages((prev) => dedupeMessages([...prev, optimisticMsg]));
      if (onAudioSent) onAudioSent();
      if (onHaptic) onHaptic();
      return clientTempId;
    },
    [roomId, currentUser, onAudioSent, onHaptic]
  );

  const updateAttachmentUploadProgress = useCallback((clientTempId: string, progress: number) => {
    const msg = optimisticMapRef.current.get(clientTempId);
    if (!msg?.attachment) return;
    const updated: ChatMessage = {
      ...msg,
      attachment: { ...msg.attachment, uploadProgress: Math.max(0, Math.min(100, progress)) }
    };
    optimisticMapRef.current.set(clientTempId, updated);
    setMessages((prev) => prev.map((item) => item.clientTempId === clientTempId ? updated : item));
  }, []);

  const completeAttachmentUpload = useCallback(
    async (clientTempId: string, attachment: MessageAttachment) => {
      const previous = optimisticMapRef.current.get(clientTempId);
      if (!previous) return;

      const completed: ChatMessage = {
        ...previous,
        attachment: { ...attachment, uploadState: undefined, uploadProgress: undefined },
        status: 'sending',
        errorMessage: undefined
      };
      optimisticMapRef.current.set(clientTempId, completed);
      setMessages((prev) => prev.map((item) => item.clientTempId === clientTempId ? completed : item));
      await localCache.enqueueOutbox(completed);

      if (!isOnline) {
        return;
      }

      try {
        await persistMessage(completed);
        await localCache.removeFromOutbox(clientTempId);
        setMessages((prev) => prev.map((item) =>
          item.clientTempId === clientTempId && item.status !== 'delivered'
            ? { ...item, status: 'sent' }
            : item
        ));
      } catch (err: unknown) {
        const error = err as Error;
        const failed = { ...completed, status: 'failed' as const, errorMessage: error.message || 'Failed to send attachment message' };
        optimisticMapRef.current.set(clientTempId, failed);
        setMessages((prev) => prev.map((item) => item.clientTempId === clientTempId ? failed : item));
      }
    },
    [isOnline]
  );

  const failAttachmentUpload = useCallback((clientTempId: string, errorMessage: string) => {
    const msg = optimisticMapRef.current.get(clientTempId);
    if (!msg) return;
    const failed: ChatMessage = {
      ...msg,
      status: 'failed',
      errorMessage,
      attachment: msg.attachment
        ? { ...msg.attachment, uploadState: 'failed', uploadProgress: undefined }
        : null
    };
    optimisticMapRef.current.set(clientTempId, failed);
    setMessages((prev) => prev.map((item) => item.clientTempId === clientTempId ? failed : item));
  }, []);

  const retryAttachmentUpload = useCallback((clientTempId: string) => {
    const msg = optimisticMapRef.current.get(clientTempId);
    if (!msg?.attachment || msg.attachment.key) return;
    const retrying: ChatMessage = {
      ...msg,
      status: 'sending',
      errorMessage: undefined,
      attachment: {
        ...msg.attachment,
        uploadState: 'uploading',
        uploadProgress: 0
      }
    };
    optimisticMapRef.current.set(clientTempId, retrying);
    setMessages((prev) => prev.map((item) => item.clientTempId === clientTempId ? retrying : item));
  }, []);

  // Retry Firestore delivery for messages whose attachment has already uploaded.
  const retryMessage = useCallback(
    async (clientTempId: string) => {
      const msg = optimisticMapRef.current.get(clientTempId);
      if (!msg || !currentUser) return;
      if (msg.attachment && !msg.attachment.key) return;

      // Update state to sending
      msg.status = 'sending';
      msg.errorMessage = undefined;
      setMessages((prev) =>
        prev.map((m) =>
          m.clientTempId === clientTempId ? { ...m, status: 'sending', errorMessage: undefined } : m
        )
      );

      try {
        await persistMessage(msg);
        await localCache.removeFromOutbox(clientTempId);

        setMessages((prev) =>
          prev.map((m) =>
            m.clientTempId === clientTempId && m.status !== 'delivered'
              ? { ...m, status: 'sent' }
              : m
          )
        );
      } catch (err: unknown) {
        const error = err as Error;
        msg.status = 'failed';
        msg.errorMessage = error.message;
        setMessages((prev) =>
          prev.map((m) =>
            m.clientTempId === clientTempId ? { ...m, status: 'failed', errorMessage: error.message } : m
          )
        );
      }
    },
    [currentUser]
  );

  // Interactive Emoji Reactions
  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUser) return;
      const msg = messages.find((m) => m.id === messageId);
      if (!msg || msg.status === 'sending' || msg.status === 'failed') return;

      const reactions = { ...(msg.reactions || {}) };
      const currentList = reactions[emoji] || [];
      const uid = currentUser.uid;

      if (currentList.includes(uid)) {
        reactions[emoji] = currentList.filter((id) => id !== uid);
        if (reactions[emoji].length === 0) {
          delete reactions[emoji];
        }
      } else {
        reactions[emoji] = [...currentList, uid];
      }

      // Optimistic update
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );

      // Persist to Firestore
      try {
        const msgRef = doc(db, `rooms/${roomId}/messages`, messageId);
        await updateDoc(msgRef, { reactions });
      } catch (err) {
        console.warn('[Reactions] Failed to update reaction:', err);
      }
    },
    [roomId, currentUser, messages]
  );

  // Delete message (sender only)
  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!currentUser) return;
      const message = messages.find((item) => item.id === messageId);
      if (!message || message.status === 'sending' || message.status === 'failed') return;
      try {
        const msgRef = doc(db, `rooms/${roomId}/messages`, messageId);
        await deleteDoc(msgRef);
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } catch (err) {
        console.error('[Messages] Delete message error:', err);
      }
    },
    [roomId, currentUser, messages]
  );

  return {
    messages,
    isOnline,
    initialLoading,
    sendMessage,
    beginAttachmentUpload,
    updateAttachmentUploadProgress,
    completeAttachmentUpload,
    failAttachmentUpload,
    retryAttachmentUpload,
    retryMessage,
    toggleReaction,
    deleteMessage
  };
}
