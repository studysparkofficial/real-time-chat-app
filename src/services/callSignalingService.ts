import { io, Socket } from 'socket.io-client';
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
  private socket: Socket | null = null;
  private currentUserId: string | null = null;

  constructor() {
    this.initSocketIfAvailable();
  }

  private initSocketIfAvailable(): void {
    if (typeof window === 'undefined') return;

    // Connect to Socket.IO if server is accessible
    try {
      this.socket = io({
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        if (this.currentUserId) {
          this.socket?.emit('register_user', { uid: this.currentUserId });
        }
      });
    } catch {
      // Socket.IO optional
      this.socket = null;
    }
  }

  public registerUser(userId: string): void {
    this.currentUserId = userId;
    if (this.socket && this.socket.connected) {
      this.socket.emit('register_user', { uid: userId });
    }
  }

  /**
   * Create a new call document in Firestore and emit socket event if available
   */
  public async createCall(session: CallSession): Promise<void> {
    const callRef = doc(db, 'calls', session.id);
    await setDoc(callRef, {
      ...session,
      createdAt: session.createdAt || Date.now()
    });

    if (this.socket?.connected) {
      this.socket.emit('call:initiate', {
        toUid: session.recipient.uid,
        callSession: session
      });
    }
  }

  /**
   * Listen for incoming calls where recipient matches current user and status is ringing
   */
  public subscribeToIncomingCalls(
    userId: string,
    onIncomingCall: (call: CallSession) => void
  ): () => void {
    this.registerUser(userId);

    // 1. Primary real-time listener via Firestore
    const callsCol = collection(db, 'calls');
    const q = query(
      callsCol,
      where('recipient.uid', '==', userId),
      where('status', 'in', ['ringing', 'initiating'])
    );

    const unsubFirestore = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data() as CallSession;
            // Only alert if call was created within the last 45 seconds
            const ageMs = Date.now() - (data.createdAt || 0);
            if (ageMs < 45000 && data.status === 'ringing') {
              onIncomingCall(data);
            }
          }
        });
      },
      (err) => {
        console.warn('[CallSignaling] Incoming calls listener warning:', err);
      }
    );

    // 2. Secondary low-latency listener via Socket.IO
    const handleSocketIncoming = (callSession: CallSession) => {
      if (callSession.recipient?.uid === userId && callSession.status === 'ringing') {
        onIncomingCall(callSession);
      }
    };

    if (this.socket) {
      this.socket.on('call:incoming', handleSocketIncoming);
    }

    return () => {
      unsubFirestore();
      if (this.socket) {
        this.socket.off('call:incoming', handleSocketIncoming);
      }
    };
  }

  /**
   * Listen for updates to a specific call session
   */
  public subscribeToCall(
    callId: string,
    onUpdate: (call: CallSession) => void
  ): () => void {
    const callRef = doc(db, 'calls', callId);

    const unsubFirestore = onSnapshot(
      callRef,
      (snapshot) => {
        if (snapshot.exists()) {
          onUpdate(snapshot.data() as CallSession);
        }
      },
      (err) => {
        console.warn(`[CallSignaling] Error subscribing to call ${callId}:`, err);
      }
    );

    const handleSocketAccepted = (data: { callId: string }) => {
      if (data.callId === callId) {
        onUpdate({ id: callId, status: 'accepted' } as CallSession);
      }
    };

    const handleSocketRejected = (data: { callId: string; reason?: string }) => {
      if (data.callId === callId) {
        onUpdate({
          id: callId,
          status: 'rejected',
          endedReason: (data.reason as CallSession['endedReason']) || 'declined'
        } as CallSession);
      }
    };

    const handleSocketEnded = (data: { callId: string }) => {
      if (data.callId === callId) {
        onUpdate({ id: callId, status: 'ended', endedReason: 'completed' } as CallSession);
      }
    };

    const handleSocketBusy = (data: { callId: string }) => {
      if (data.callId === callId) {
        onUpdate({ id: callId, status: 'busy', endedReason: 'busy' } as CallSession);
      }
    };

    if (this.socket) {
      this.socket.on('call:accepted', handleSocketAccepted);
      this.socket.on('call:rejected', handleSocketRejected);
      this.socket.on('call:ended', handleSocketEnded);
      this.socket.on('call:busy', handleSocketBusy);
    }

    return () => {
      unsubFirestore();
      if (this.socket) {
        this.socket.off('call:accepted', handleSocketAccepted);
        this.socket.off('call:rejected', handleSocketRejected);
        this.socket.off('call:ended', handleSocketEnded);
        this.socket.off('call:busy', handleSocketBusy);
      }
    };
  }

  /**
   * Update the status of a call session
   */
  public async updateCallStatus(
    callId: string,
    status: CallStatus,
    extra: Partial<CallSession> = {}
  ): Promise<void> {
    try {
      const callRef = doc(db, 'calls', callId);
      const { recipient: socketRecipient, ...persistedExtra } = extra;
      const updates: Record<string, any> = {
        status,
        ...persistedExtra
      };

      if (status === 'accepted') {
        updates.answeredAt = updates.answeredAt || Date.now();
      } else if (['ended', 'rejected', 'busy', 'missed', 'failed'].includes(status)) {
        updates.endedAt = updates.endedAt || Date.now();
      }

      await updateDoc(callRef, updates);

      // Notify via Socket.IO if peer UID is provided in extra
      if (this.socket?.connected && socketRecipient?.uid) {
        const toUid = socketRecipient.uid;
        if (status === 'ringing') this.socket.emit('call:ringing', { toUid, callId });
        if (status === 'accepted') this.socket.emit('call:accept', { toUid, callId });
        if (status === 'rejected') this.socket.emit('call:reject', { toUid, callId, reason: extra.endedReason });
        if (status === 'busy') this.socket.emit('call:busy', { toUid, callId });
        if (status === 'ended') this.socket.emit('call:end', { toUid, callId });
      }
    } catch (err) {
      console.warn(`[CallSignaling] Error updating call status for ${callId}:`, err);
    }
  }

  /**
   * Save a call record into user's private call history
   */
  public async saveCallHistory(userId: string, historyItem: CallHistoryItem): Promise<void> {
    try {
      const historyRef = doc(db, 'user_private', userId, 'call_history', historyItem.id);
      await setDoc(historyRef, historyItem);
    } catch (err) {
      console.warn('[CallSignaling] Failed to save call history:', err);
    }
  }

  /**
   * Fetch recent call history for current user
   */
  public async getCallHistory(userId: string, maxItems: number = 20): Promise<CallHistoryItem[]> {
    try {
      const historyCol = collection(db, 'user_private', userId, 'call_history');
      const q = query(historyCol, orderBy('timestamp', 'desc'), limit(maxItems));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((d) => d.data() as CallHistoryItem);
    } catch (err) {
      console.warn('[CallSignaling] Failed to fetch call history:', err);
      return [];
    }
  }
}

export const callSignalingService = new CallSignalingService();
