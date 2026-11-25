import {
  db,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit
} from './firebase';
import { CallSession, CallStatus, CallHistoryItem } from '../types/chat.types';

class CallSignalingService {
  /** Create an outgoing call document containing its initial WebRTC offer. */
  public async createCall(session: CallSession): Promise<void> {
    if (!session.offer) throw new Error('A WebRTC offer is required to start a call.');
    const payload = {
      id: session.id,
      ...(session.conversationId ? { conversationId: session.conversationId } : {}),
      caller: {
        uid: session.caller.uid,
        displayName: session.caller.displayName,
        photoURL: session.caller.photoURL ?? null
      },
      recipient: {
        uid: session.recipient.uid,
        displayName: session.recipient.displayName,
        photoURL: session.recipient.photoURL ?? null
      },
      callType: session.callType,
      status: 'ringing',
      createdAt: session.createdAt || Date.now(),
      offer: session.offer
    };
    await setDoc(doc(db, 'calls', session.id), payload);
  }

  /** Store the recipient's WebRTC answer and mark the call accepted atomically. */
  public async acceptCallWithAnswer(
    callId: string,
    answer: NonNullable<CallSession['answer']>
  ): Promise<void> {
    await updateDoc(doc(db, 'calls', callId), {
      status: 'accepted',
      answer,
      answeredAt: Date.now()
    });
  }

  public async setScreenShare(callId: string, userId: string | null): Promise<void> {
    await updateDoc(doc(db, 'calls', callId), { screenShareBy: userId });
  }

  public subscribeToIncomingCalls(
    userId: string,
    onIncomingCall: (call: CallSession) => void
  ): () => void {
    const incomingCalls = query(
      collection(db, 'calls'),
      where('recipient.uid', '==', userId),
      where('status', '==', 'ringing')
    );
    const seenCallIds = new Set<string>();

    return onSnapshot(
      incomingCalls,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added' || seenCallIds.has(change.doc.id)) return;
          const session = change.doc.data() as CallSession;
          const ageMs = Date.now() - (session.createdAt || 0);
          if (ageMs < 45000 && session.status === 'ringing') {
            seenCallIds.add(change.doc.id);
            onIncomingCall(session);
          }
        });
      },
      (error) => console.warn('[CallSignaling] Incoming calls listener warning:', error)
    );
  }

  public subscribeToCall(
    callId: string,
    onUpdate: (call: CallSession) => void
  ): () => void {
    return onSnapshot(
      doc(db, 'calls', callId),
      (snapshot) => {
        if (snapshot.exists()) onUpdate(snapshot.data() as CallSession);
      },
      (error) => console.warn(`[CallSignaling] Error subscribing to call ${callId}:`, error)
    );
  }

  public async updateCallStatus(
    callId: string,
    status: CallStatus,
    extra: Partial<CallSession> = {}
  ): Promise<void> {
    try {
      const { recipient: _recipient, offer: _offer, answer: _answer, ...persistedExtra } = extra;
      const updates: Record<string, any> = { status, ...persistedExtra };
      if (['ended', 'rejected', 'busy', 'missed', 'failed'].includes(status)) {
        updates.endedAt = updates.endedAt || Date.now();
      }
      await updateDoc(doc(db, 'calls', callId), updates);
    } catch (error) {
      console.warn(`[CallSignaling] Error updating call status for ${callId}:`, error);
    }
  }

  public async saveCallHistory(userId: string, historyItem: CallHistoryItem): Promise<void> {
    try {
      await setDoc(doc(db, 'user_private', userId, 'call_history', historyItem.id), historyItem);
    } catch (error) {
      console.warn('[CallSignaling] Failed to save call history:', error);
    }
  }

  public async getCallHistory(userId: string, maxItems: number = 20): Promise<CallHistoryItem[]> {
    try {
      const history = query(
        collection(db, 'user_private', userId, 'call_history'),
        orderBy('timestamp', 'desc'),
        limit(maxItems)
      );
      const snapshot = await getDocs(history);
      return snapshot.docs.map((item) => item.data() as CallHistoryItem);
    } catch (error) {
      console.warn('[CallSignaling] Failed to fetch call history:', error);
      return [];
    }
  }
}

export const callSignalingService = new CallSignalingService();
