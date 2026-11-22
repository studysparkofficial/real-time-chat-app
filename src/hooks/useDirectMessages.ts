import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  db,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where
} from '../services/firebase';
import { ChatUser, DirectConversation } from '../types/chat.types';
import { getDirectConversationId, toChatUser, toConversationParticipant } from '../services/directMessages';

function toMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function useDirectMessages(currentUser: ChatUser | null) {
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [lastReadAt, setLastReadAt] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!currentUser?.uid) {
      setConversations([]);
      setLastReadAt({});
      return;
    }

    const conversationsQuery = query(
      collection(db, 'rooms'),
      where('type', '==', 'direct'),
      where('participants', 'array-contains', currentUser.uid)
    );
    const unsubscribeConversations = onSnapshot(
      conversationsQuery,
      (snapshot) => {
        const next: DirectConversation[] = [];
        snapshot.forEach((conversationDoc) => {
          const data = conversationDoc.data();
          const participants = Array.isArray(data.participants)
            ? data.participants.filter((uid): uid is string => typeof uid === 'string')
            : [];
          const peerUid = participants.find((uid) => uid !== currentUser.uid);
          const participantInfo = (data.participantInfo || {}) as Record<string, Partial<ChatUser>>;
          const peerInfo = peerUid ? participantInfo[peerUid] : undefined;
          if (!peerUid || !peerInfo) return;

          next.push({
            id: conversationDoc.id,
            participants,
            participantInfo: data.participantInfo || {},
            lastMessage: typeof data.lastMessage === 'string' ? data.lastMessage : '',
            lastMessageAt: toMillis(data.lastMessageAt),
            lastSenderUid: typeof data.lastSenderUid === 'string' ? data.lastSenderUid : undefined,
            peer: toChatUser({ ...peerInfo, uid: peerUid })
          });
        });

        next.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
        setConversations(next);
      },
      (error) => console.warn('[Direct messages] Conversation sync failed:', error)
    );

    const stateCollection = collection(db, `user_private/${currentUser.uid}/dm_state`);
    const unsubscribeReadState = onSnapshot(
      stateCollection,
      (snapshot) => {
        const state: Record<string, number> = {};
        snapshot.forEach((readDoc) => {
          state[readDoc.id] = toMillis(readDoc.data().lastReadAt);
        });
        setLastReadAt(state);
      },
      (error) => console.warn('[Direct messages] Read-state sync failed:', error)
    );

    return () => {
      unsubscribeConversations();
      unsubscribeReadState();
    };
  }, [currentUser?.uid]);

  const unreadConversationIds = useMemo(() => {
    if (!currentUser) return new Set<string>();
    return new Set(
      conversations
        .filter((conversation) =>
          conversation.lastSenderUid !== currentUser.uid
          && (conversation.lastMessageAt || 0) > (lastReadAt[conversation.id] || 0)
        )
        .map((conversation) => conversation.id)
    );
  }, [conversations, currentUser?.uid, lastReadAt]);

  const startConversation = useCallback(async (otherUser: ChatUser): Promise<string> => {
    if (!currentUser?.uid) throw new Error('Sign in to start a private chat.');
    if (otherUser.uid === currentUser.uid) throw new Error('You cannot start a chat with yourself.');

    const id = getDirectConversationId(currentUser.uid, otherUser.uid);
    const roomRef = doc(db, 'rooms', id);
    const participants = [currentUser.uid, otherUser.uid].sort();
    const participantInfo = {
      [currentUser.uid]: toConversationParticipant(currentUser),
      [otherUser.uid]: toConversationParticipant(otherUser)
    };

    await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(roomRef);
      if (existing.exists()) {
        const data = existing.data();
        if (
          data.type !== 'direct'
          || !Array.isArray(data.participants)
          || !data.participants.includes(currentUser.uid)
          || !data.participants.includes(otherUser.uid)
        ) {
          throw new Error('This conversation is unavailable.');
        }
        return;
      }

      transaction.set(roomRef, {
        type: 'direct',
        participants,
        participantInfo,
        createdAt: Date.now(),
        lastMessage: '',
        lastMessageAt: 0
      });
    });

    return id;
  }, [currentUser]);

  const markRead = useCallback(async (conversationId: string) => {
    if (!currentUser?.uid) return;
    const readAt = Date.now();
    setLastReadAt((previous) => ({ ...previous, [conversationId]: readAt }));
    try {
      await setDoc(
        doc(db, `user_private/${currentUser.uid}/dm_state`, conversationId),
        { lastReadAt: serverTimestamp() },
        { merge: true }
      );
    } catch (error) {
      console.warn('[Direct messages] Could not save read state:', error);
    }
  }, [currentUser?.uid]);

  return { conversations, unreadConversationIds, startConversation, markRead };
}
