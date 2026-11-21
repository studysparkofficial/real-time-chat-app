import { useState, useEffect, useRef, useCallback } from 'react';
import {
  db,
  collection,
  doc,
  addDoc,
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
  ChatMessage,
  ChatUser,
  MessageAttachment,
  MessageReplyReference
} from '../types/chat.types';

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

  // Monitor online / offline network state
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushOutbox();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [roomId]);

  // Flush queued outbox messages upon reconnect
  const flushOutbox = useCallback(async () => {
    const pending = await localCache.getOutbox();
    if (pending.length === 0) return;

    for (const msg of pending) {
      if (msg.roomId === roomId && currentUser) {
        try {
          const colRef = collection(db, `rooms/${roomId}/messages`);
          await addDoc(colRef, {
            text: msg.text,
            sender: msg.sender,
            timestamp: serverTimestamp(),
            attachment: msg.attachment || null,
            reactions: msg.reactions || {},
            replyTo: msg.replyTo || null,
            clientTempId: msg.clientTempId
          });

          await localCache.removeFromOutbox(msg.clientTempId!);
          optimisticMapRef.current.delete(msg.clientTempId!);

          setMessages((prev) =>
            prev.map((m) =>
              m.clientTempId === msg.clientTempId ? { ...m, status: 'sent' } : m
            )
          );
        } catch {
          // Will retry on next reconnect
        }
      }
    }
  }, [roomId, currentUser]);

  // Cold Boot from IndexedDB Cache (< 50ms) + Real-time Firestore Stream
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isCurrentRoom = true;

    // 1. Instant cold boot from local IndexedDB cache
    localCache.getCachedMessages(roomId, 100).then((cached) => {
      if (!isCurrentRoom) return;
      if (cached && cached.length > 0) {
        setMessages(cached);
        setInitialLoading(false);
      }
    });

    // 2. Real-time Firestore listener with metadata changes enabled
    const messagesRef = collection(db, `rooms/${roomId}/messages`);
    const q = query(messagesRef, orderBy('timestamp', 'asc'), limit(150));

    unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!isCurrentRoom) return;

        const remoteList: ChatMessage[] = [];
        let hasNewIncoming = false;

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const docMetadata = docSnap.metadata;

          // Convert timestamp
          let ts = Date.now();
          if (data.timestamp) {
            if (typeof data.timestamp.toMillis === 'function') {
              ts = data.timestamp.toMillis();
            } else if (typeof data.timestamp === 'number') {
              ts = data.timestamp;
            }
          }

          // Determine delivery status
          // If Firestore is still uploading local writes, status is 'sent' (single check)
          // Once synced to cloud server without pending writes, it's 'delivered' (double check)
          const isPending = docMetadata.hasPendingWrites;
          const status: ChatMessage['status'] = isPending ? 'sent' : 'delivered';

          const rawAttachment = data.attachment;
          let normalizedAttachment: MessageAttachment | null = null;
          if (rawAttachment) {
            normalizedAttachment = {
              key: rawAttachment.key || '',
              url: rawAttachment.url || rawAttachment.downloadUrl || '',
              downloadUrl: rawAttachment.downloadUrl || rawAttachment.url || '',
              fileName: rawAttachment.fileName || rawAttachment.name || 'attachment',
              name: rawAttachment.name || rawAttachment.fileName || 'attachment',
              fileSize: rawAttachment.fileSize || rawAttachment.size || 0,
              size: rawAttachment.size || rawAttachment.fileSize || 0,
              mimeType: rawAttachment.mimeType || rawAttachment.type || 'application/octet-stream',
              type: rawAttachment.type || rawAttachment.mimeType || 'application/octet-stream',
              category: rawAttachment.category || 'file'
            };
          }

          const msg: ChatMessage = {
            id: docSnap.id,
            roomId,
            text: data.text || '',
            sender: data.sender || { uid: 'unknown', displayName: 'Anonymous' },
            timestamp: ts,
            status,
            attachment: normalizedAttachment,
            reactions: data.reactions || {},
            replyTo: data.replyTo || null,
            clientTempId: data.clientTempId
          };

          // If this message satisfies an optimistic message, clear it
          if (data.clientTempId && optimisticMapRef.current.has(data.clientTempId)) {
            optimisticMapRef.current.delete(data.clientTempId);
            localCache.removeFromOutbox(data.clientTempId);
          }

          // Check if it's an incoming message from someone else
          if (
            hasMountedRef.current &&
            currentUser &&
            data.sender?.uid !== currentUser.uid &&
            !docMetadata.fromCache
          ) {
            hasNewIncoming = true;
          }

          remoteList.push(msg);
        });

        // Merge any remaining optimistic messages that haven't hit the listener yet
        const remainingOptimistic = Array.from(optimisticMapRef.current.values()).filter(
          (m) => m.roomId === roomId
        );

        const merged = [...remoteList, ...remainingOptimistic].sort(
          (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
        );

        setMessages(merged);
        setInitialLoading(false);

        // Async write to IndexedDB for next cold boot
        if (remoteList.length > 0) {
          localCache.cacheMessages(remoteList);
        }

        if (hasNewIncoming && onAudioReceived) {
          onAudioReceived();
        }

        hasMountedRef.current = true;
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
  }, [roomId]);

  // Send Message with Optimistic UI & Offline Outbox Queueing
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
        id: clientTempId,
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
        clientTempId
      };

      // 1. Immediately render message in UI (Zero lag)
      optimisticMapRef.current.set(clientTempId, optimisticMsg);
      setMessages((prev) => [...prev, optimisticMsg]);

      // 2. Play audio & trigger subtle vibration
      if (onAudioSent) onAudioSent();
      if (onHaptic) onHaptic();

      // 3. Queue in IndexedDB Outbox
      await localCache.enqueueOutbox(optimisticMsg);

      // 4. If offline, keep in 'sending' or 'failed' until online
      if (!navigator.onLine) {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientTempId === clientTempId ? { ...m, status: 'sending' } : m
          )
        );
        return;
      }

      // 5. Commit to Firestore
      try {
        const colRef = collection(db, `rooms/${roomId}/messages`);
        const payload: Record<string, unknown> = {
          text: optimisticMsg.text,
          sender: optimisticMsg.sender,
          timestamp: serverTimestamp(),
          reactions: {},
          clientTempId
        };
        if (attachment) {
          payload.attachment = {
            key: attachment.key,
            url: attachment.url || attachment.downloadUrl || '',
            downloadUrl: attachment.downloadUrl || attachment.url || '',
            fileName: attachment.fileName || attachment.name || 'attachment',
            name: attachment.name || attachment.fileName || 'attachment',
            fileSize: attachment.fileSize || attachment.size || 0,
            size: attachment.size || attachment.fileSize || 0,
            mimeType: attachment.mimeType || attachment.type || 'application/octet-stream',
            type: attachment.type || attachment.mimeType || 'application/octet-stream',
            category: attachment.category || 'file'
          };
        }
        if (replyTo) payload.replyTo = replyTo;

        await addDoc(colRef, payload);

        // Update optimistic item to 'sent' (✓) until remote confirms 'delivered' (✓✓)
        setMessages((prev) =>
          prev.map((m) =>
            m.clientTempId === clientTempId ? { ...m, status: 'sent' } : m
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
    [roomId, currentUser, onAudioSent, onHaptic]
  );

  // 1-Tap Retry for Failed Messages
  const retryMessage = useCallback(
    async (clientTempId: string) => {
      const msg = optimisticMapRef.current.get(clientTempId);
      if (!msg || !currentUser) return;

      // Update state to sending
      msg.status = 'sending';
      msg.errorMessage = undefined;
      setMessages((prev) =>
        prev.map((m) =>
          m.clientTempId === clientTempId ? { ...m, status: 'sending', errorMessage: undefined } : m
        )
      );

      try {
        const colRef = collection(db, `rooms/${roomId}/messages`);
        const payload: Record<string, unknown> = {
          text: msg.text,
          sender: msg.sender,
          timestamp: serverTimestamp(),
          reactions: msg.reactions || {},
          clientTempId
        };
        if (msg.attachment) payload.attachment = msg.attachment;
        if (msg.replyTo) payload.replyTo = msg.replyTo;

        await addDoc(colRef, payload);

        setMessages((prev) =>
          prev.map((m) =>
            m.clientTempId === clientTempId ? { ...m, status: 'sent' } : m
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
    [roomId, currentUser]
  );

  // Interactive Emoji Reactions
  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUser) return;
      const msg = messages.find((m) => m.id === messageId);
      if (!msg) return;

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
      try {
        const msgRef = doc(db, `rooms/${roomId}/messages`, messageId);
        await deleteDoc(msgRef);
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } catch (err) {
        console.error('[Messages] Delete message error:', err);
      }
    },
    [roomId, currentUser]
  );

  return {
    messages,
    isOnline,
    initialLoading,
    sendMessage,
    retryMessage,
    toggleReaction,
    deleteMessage
  };
}
