import { useState, useEffect, useRef, useCallback } from 'react';
import { callApiService } from '../services/callApiService';
import { callSignalingService } from '../services/callSignalingService';
import { callNotificationService } from '../services/callNotificationService';
import {
  ChatUser,
  CallSession,
  CallStatus,
  CallType,
  ChimeMeetingCredentials,
  CallHistoryItem
} from '../types/chat.types';

export function useCalling(
  currentUser: ChatUser | null,
  addToast?: (message: string, type?: 'info' | 'success' | 'error') => void
) {
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [meetingCredentials, setMeetingCredentials] = useState<ChimeMeetingCredentials | null>(null);
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);

  // Timers and references
  const callTimeoutRef = useRef<number | null>(null);
  const activeCallRef = useRef<CallSession | null>(null);
  const incomingCallRef = useRef<CallSession | null>(null);
  const callStartTimeRef = useRef<number | null>(null);

  activeCallRef.current = activeCall;
  incomingCallRef.current = incomingCall;

  // Browser push permission is requested only after the user explicitly enables alerts.
  useEffect(() => {
    if (currentUser?.uid) {
      callSignalingService.registerUser(currentUser.uid);
      void callSignalingService.getCallHistory(currentUser.uid).then((history) => {
        setCallHistory(history);
      });
    }
  }, [currentUser?.uid]);

  // Clear timeout helper
  const clearCallTimeout = useCallback(() => {
    if (callTimeoutRef.current !== null) {
      window.clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  }, []);

  // Record completed/missed call in private call history
  const recordCallHistory = useCallback(
    (
      session: CallSession,
      status: CallHistoryItem['status'],
      durationSeconds: number = 0
    ) => {
      if (!currentUser?.uid) return;

      const isCaller = session.caller.uid === currentUser.uid;
      const peer = isCaller ? session.recipient : session.caller;

      const historyItem: CallHistoryItem = {
        id: session.id,
        peer,
        direction: isCaller ? 'outgoing' : 'incoming',
        callType: session.callType,
        status,
        durationSeconds,
        timestamp: Date.now()
      };

      setCallHistory((prev) => [historyItem, ...prev.filter((item) => item.id !== session.id)]);
      void callSignalingService.saveCallHistory(currentUser.uid, historyItem);
    },
    [currentUser?.uid]
  );

  // 1. Subscribe to Incoming Calls targeting the current user
  useEffect(() => {
    if (!currentUser?.uid) return;

    const unsubIncoming = callSignalingService.subscribeToIncomingCalls(
      currentUser.uid,
      (call) => {
        // Prevent duplicate or conflicting calls
        if (activeCallRef.current || incomingCallRef.current) {
          // If already on another call, reject with busy status
          void callSignalingService.updateCallStatus(call.id, 'busy', {
            endedReason: 'busy',
            recipient: call.caller
          });
          return;
        }

        setIncomingCall(call);
        callNotificationService.startIncomingRingtone();
        // Ringing timeout (35s) for incoming call
        clearCallTimeout();
        callTimeoutRef.current = window.setTimeout(() => {
          if (incomingCallRef.current?.id === call.id) {
            callNotificationService.stopIncomingRingtone();
            setIncomingCall(null);
            void callSignalingService.updateCallStatus(call.id, 'missed', {
              endedReason: 'timeout'
            });
            recordCallHistory(call, 'missed', 0);
            addToast?.(`Missed ${call.callType} call from ${call.caller.displayName}`, 'info');
          }
        }, 35000);
      }
    );

    return () => {
      unsubIncoming();
      callNotificationService.stopIncomingRingtone();
      clearCallTimeout();
    };
  }, [currentUser?.uid, clearCallTimeout, recordCallHistory, addToast]);

  // 2. Subscribe to updates for the active call session
  useEffect(() => {
    if (!activeCall?.id) return;

    const unsubCall = callSignalingService.subscribeToCall(activeCall.id, (updated) => {
      // Recipient accepted the call!
      if (updated.status === 'accepted') {
        clearCallTimeout();
        callNotificationService.stopOutgoingRingback();
        callNotificationService.playCallConnected();
        callStartTimeRef.current = Date.now();
        setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : null));
        return;
      }

      // Call was rejected by recipient
      if (updated.status === 'rejected') {
        clearCallTimeout();
        callNotificationService.stopOutgoingRingback();
        callNotificationService.playCallEnded();
        addToast?.(`${activeCall.recipient.displayName} declined the call`, 'info');
        recordCallHistory(activeCall, 'rejected', 0);
        setActiveCall(null);
        setMeetingCredentials(null);
        return;
      }

      // Recipient is busy on another call
      if (updated.status === 'busy') {
        clearCallTimeout();
        callNotificationService.stopOutgoingRingback();
        callNotificationService.playCallBusy();
        addToast?.(`${activeCall.recipient.displayName} is currently busy`, 'info');
        recordCallHistory(activeCall, 'busy', 0);
        setActiveCall(null);
        setMeetingCredentials(null);
        return;
      }

      // Call was ended or timed out
      if (updated.status === 'ended' || updated.status === 'missed') {
        clearCallTimeout();
        callNotificationService.stopOutgoingRingback();
        callNotificationService.playCallEnded();

        const duration = callStartTimeRef.current
          ? Math.max(0, Math.floor((Date.now() - callStartTimeRef.current) / 1000))
          : 0;

        recordCallHistory(activeCall, updated.status === 'missed' ? 'missed' : 'completed', duration);
        setActiveCall(null);
        setMeetingCredentials(null);
      }
    });

    return () => {
      unsubCall();
    };
  }, [activeCall?.id, clearCallTimeout, recordCallHistory, addToast]);

  /**
   * Start an outgoing call (voice or video)
   */
  const startCall = useCallback(
    async (peer: ChatUser, callType: CallType) => {
      if (!currentUser) {
        addToast?.('Please sign in to make calls', 'error');
        return;
      }

      if (peer.uid === currentUser.uid) {
        addToast?.('Cannot call yourself', 'error');
        return;
      }

      if (activeCall || incomingCall) {
        addToast?.('You are already in a call', 'info');
        return;
      }

      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      const session: CallSession = {
        id: callId,
        caller: {
          uid: currentUser.uid,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL
        },
        recipient: {
          uid: peer.uid,
          displayName: peer.displayName,
          photoURL: peer.photoURL
        },
        callType,
        status: 'initiating',
        createdAt: Date.now()
      };

      setActiveCall(session);
      callNotificationService.startOutgoingRingback();

      try {
        // 1. Request Chime meeting and attendee credentials from backend
        const response = await callApiService.createMeeting(peer.uid, callType, callId);

        // 2. Publish call document to Firestore with status 'ringing'
        const liveSession: CallSession = {
          ...session,
          status: 'ringing',
          meetingId: response.meeting.MeetingId
        };

        await callSignalingService.createCall(liveSession);

        setActiveCall(liveSession);
        setMeetingCredentials({
          Meeting: response.meeting,
          Attendee: response.attendee
        });

        // 3. Set outgoing call timeout (35 seconds)
        clearCallTimeout();
        callTimeoutRef.current = window.setTimeout(async () => {
          if (activeCallRef.current?.id === callId && activeCallRef.current.status === 'ringing') {
            callNotificationService.stopOutgoingRingback();
            callNotificationService.playCallEnded();
            addToast?.(`${peer.displayName} is unavailable`, 'info');

            await callSignalingService.updateCallStatus(callId, 'missed', {
              endedReason: 'timeout'
            });
            await callApiService.endMeeting(response.meeting.MeetingId, callId);
            recordCallHistory(liveSession, 'missed', 0);

            setActiveCall(null);
            setMeetingCredentials(null);
          }
        }, 35000);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to start call';
        console.error('[useCalling] Failed to start call:', err);
        callNotificationService.stopOutgoingRingback();
        callNotificationService.playCallEnded();
        addToast?.(errorMsg, 'error');
        setActiveCall(null);
        setMeetingCredentials(null);
      }
    },
    [currentUser, activeCall, incomingCall, clearCallTimeout, recordCallHistory, addToast]
  );

  /**
   * Accept an incoming call
   */
  const acceptCall = useCallback(async () => {
    if (!incomingCall || !currentUser) return;

    clearCallTimeout();
    callNotificationService.stopIncomingRingtone();

    const callToAccept = incomingCall;
    setIncomingCall(null);

    setActiveCall({
      ...callToAccept,
      status: 'connecting'
    });

    try {
      if (!callToAccept.meetingId) {
        throw new Error('Call is missing meeting information');
      }

      // 1. Join Chime meeting via backend
      const response = await callApiService.joinMeeting(callToAccept.id, callToAccept.meetingId);

      // 2. Update status in signaling
      await callSignalingService.updateCallStatus(callToAccept.id, 'accepted', {
        answeredAt: Date.now(),
        recipient: callToAccept.caller
      });

      callNotificationService.playCallConnected();
      callStartTimeRef.current = Date.now();

      setActiveCall({
        ...callToAccept,
        status: 'connected'
      });

      setMeetingCredentials({
        Meeting: { MeetingId: callToAccept.meetingId },
        Attendee: response.attendee
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to join call';
      console.error('[useCalling] Accept call failed:', err);
      callNotificationService.playCallEnded();
      addToast?.(errorMsg, 'error');
      await callSignalingService.updateCallStatus(callToAccept.id, 'failed');
      setActiveCall(null);
      setMeetingCredentials(null);
    }
  }, [incomingCall, currentUser, clearCallTimeout, addToast]);

  /**
   * Reject an incoming call
   */
  const rejectCall = useCallback(async () => {
    if (!incomingCall) return;

    clearCallTimeout();
    callNotificationService.stopIncomingRingtone();

    const callToReject = incomingCall;
    setIncomingCall(null);

    await callSignalingService.updateCallStatus(callToReject.id, 'rejected', {
      endedReason: 'declined',
      recipient: callToReject.caller
    });

    recordCallHistory(callToReject, 'rejected', 0);
  }, [incomingCall, clearCallTimeout, recordCallHistory]);

  /**
   * End an ongoing call
   */
  const endCall = useCallback(async () => {
    const current = activeCallRef.current;
    if (!current) return;

    clearCallTimeout();
    callNotificationService.stopOutgoingRingback();
    callNotificationService.stopIncomingRingtone();
    callNotificationService.playCallEnded();

    const duration = callStartTimeRef.current
      ? Math.max(0, Math.floor((Date.now() - callStartTimeRef.current) / 1000))
      : 0;

    setActiveCall(null);
    setMeetingCredentials(null);

    try {
      await callSignalingService.updateCallStatus(current.id, 'ended', {
        endedReason: 'completed',
        endedAt: Date.now(),
        recipient: current.caller.uid === currentUser?.uid ? current.recipient : current.caller
      });

      if (current.meetingId) {
        await callApiService.endMeeting(current.meetingId, current.id);
      }

      recordCallHistory(current, 'completed', duration);
    } catch (err) {
      console.warn('[useCalling] Error ending call:', err);
    }
  }, [currentUser?.uid, clearCallTimeout, recordCallHistory]);

  return {
    activeCall,
    incomingCall,
    meetingCredentials,
    callHistory,
    isRinging: activeCall?.status === 'ringing',
    isConnected: activeCall?.status === 'connected',
    startCall,
    acceptCall,
    rejectCall,
    endCall
  };
}
