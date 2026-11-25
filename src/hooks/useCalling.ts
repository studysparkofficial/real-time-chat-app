import { useState, useEffect, useRef, useCallback } from 'react';
import { callSignalingService } from '../services/callSignalingService';
import { webRtcCallService, WebRtcCallCallbacks } from '../services/webrtcCallService';
import { callNotificationService } from '../services/callNotificationService';
import {
  ChatUser,
  CallSession,
  CallType,
  CallHistoryItem
} from '../types/chat.types';

export function useCalling(
  currentUser: ChatUser | null,
  addToast?: (message: string, type?: 'info' | 'success' | 'error') => void
) {
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);

  const callTimeoutRef = useRef<number | null>(null);
  const activeCallRef = useRef<CallSession | null>(null);
  const incomingCallRef = useRef<CallSession | null>(null);
  const callStartTimeRef = useRef<number | null>(null);

  activeCallRef.current = activeCall;
  incomingCallRef.current = incomingCall;

  const clearCallTimeout = useCallback(() => {
    if (callTimeoutRef.current !== null) {
      window.clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  }, []);

  const recordCallHistory = useCallback(
    (session: CallSession, status: CallHistoryItem['status'], durationSeconds = 0) => {
      if (!currentUser?.uid) return;
      const isCaller = session.caller.uid === currentUser.uid;
      const historyItem: CallHistoryItem = {
        id: session.id,
        peer: isCaller ? session.recipient : session.caller,
        direction: isCaller ? 'outgoing' : 'incoming',
        callType: session.callType,
        status,
        durationSeconds,
        timestamp: Date.now()
      };
      setCallHistory((previous) => [historyItem, ...previous.filter((item) => item.id !== session.id)]);
      void callSignalingService.saveCallHistory(currentUser.uid, historyItem);
    },
    [currentUser?.uid]
  );

  useEffect(() => {
    if (currentUser?.uid && !currentUser.isAnonymous) {
      void callSignalingService.getCallHistory(currentUser.uid).then(setCallHistory);
    } else {
      setCallHistory([]);
    }
  }, [currentUser?.uid, currentUser?.isAnonymous]);

  const peerCallbacks = useCallback((callId: string): WebRtcCallCallbacks => ({
    onLocalStream: (stream) => setLocalStream(stream),
    onRemoteStream: (stream) => setRemoteStream(stream),
    onConnectionState: (state) => {
      if (state === 'connected') {
        clearCallTimeout();
        callStartTimeRef.current = Date.now();
        callNotificationService.stopOutgoingRingback();
        callNotificationService.stopIncomingRingtone();
        callNotificationService.playCallConnected();
        setActiveCall((previous) => previous?.id === callId
          ? { ...previous, status: 'connected' }
          : previous);
        return;
      }

      if (state === 'failed' && activeCallRef.current?.id === callId) {
        const failedCall = activeCallRef.current;
        clearCallTimeout();
        callNotificationService.stopOutgoingRingback();
        callNotificationService.stopIncomingRingtone();
        callNotificationService.playCallEnded();
        addToast?.('WebRTC could not connect. This network may require a TURN relay.', 'error');
        void callSignalingService.updateCallStatus(callId, 'failed', { endedReason: 'network_error' });
        void webRtcCallService.endCall(callId);
        if (failedCall) recordCallHistory(failedCall, 'canceled', 0);
        callStartTimeRef.current = null;
        setLocalStream(null);
        setRemoteStream(null);
        setActiveCall(null);
      }
    }
  }), [addToast, clearCallTimeout, recordCallHistory]);

  useEffect(() => {
    if (!currentUser?.uid || currentUser.isAnonymous) return;

    const unsubscribe = callSignalingService.subscribeToIncomingCalls(currentUser.uid, (call) => {
      if (activeCallRef.current || incomingCallRef.current) {
        void callSignalingService.updateCallStatus(call.id, 'busy', {
          endedReason: 'busy',
          recipient: call.caller
        });
        return;
      }

      setIncomingCall(call);
      callNotificationService.startIncomingRingtone();
      clearCallTimeout();
      callTimeoutRef.current = window.setTimeout(() => {
        if (incomingCallRef.current?.id !== call.id) return;
        callNotificationService.stopIncomingRingtone();
        setIncomingCall(null);
        void callSignalingService.updateCallStatus(call.id, 'missed', { endedReason: 'timeout' });
        recordCallHistory(call, 'missed', 0);
        addToast?.(`Missed ${call.callType} call from ${call.caller.displayName}`, 'info');
      }, 35000);
    });

    return () => {
      unsubscribe();
      callNotificationService.stopIncomingRingtone();
      clearCallTimeout();
    };
  }, [currentUser?.uid, currentUser?.isAnonymous, clearCallTimeout, recordCallHistory, addToast]);

  useEffect(() => {
    if (!activeCall?.id || activeCall.status === 'initiating') return;
    const callId = activeCall.id;

    const unsubscribe = callSignalingService.subscribeToCall(callId, (updated) => {
      setActiveCall((previous) => previous?.id === callId
        ? { ...previous, screenShareBy: updated.screenShareBy ?? null }
        : previous);

      if (updated.status === 'accepted') {
        clearCallTimeout();
        callNotificationService.stopOutgoingRingback();
        setActiveCall((previous) => previous?.id === callId && previous.status !== 'connected'
          ? { ...previous, status: 'connecting' }
          : previous);
        return;
      }

      if (updated.status === 'rejected' || updated.status === 'busy') {
        clearCallTimeout();
        callNotificationService.stopOutgoingRingback();
        callNotificationService.playCallEnded();
        const message = updated.status === 'rejected'
          ? `${activeCall.recipient.displayName} declined the call`
          : `${activeCall.recipient.displayName} is currently busy`;
        addToast?.(message, 'info');
        recordCallHistory(activeCall, updated.status, 0);
        void webRtcCallService.endCall(callId);
        callStartTimeRef.current = null;
        setLocalStream(null);
        setRemoteStream(null);
        setActiveCall(null);
        return;
      }

      if (updated.status === 'ended' || updated.status === 'missed' || updated.status === 'failed') {
        clearCallTimeout();
        callNotificationService.stopOutgoingRingback();
        callNotificationService.stopIncomingRingtone();
        callNotificationService.playCallEnded();
        const duration = callStartTimeRef.current
          ? Math.max(0, Math.floor((Date.now() - callStartTimeRef.current) / 1000))
          : 0;
        const historyStatus: CallHistoryItem['status'] = updated.status === 'missed'
          ? 'missed'
          : updated.status === 'failed'
            ? 'canceled'
            : duration > 0 ? 'completed' : 'canceled';
        recordCallHistory(activeCall, historyStatus, duration);
        void webRtcCallService.endCall(callId);
        callStartTimeRef.current = null;
        setLocalStream(null);
        setRemoteStream(null);
        setActiveCall(null);
      }
    });

    return () => unsubscribe();
  }, [activeCall?.id, activeCall?.status, activeCall?.recipient.displayName, clearCallTimeout, recordCallHistory, addToast]);

  const startCall = useCallback(async (peer: ChatUser, callType: CallType) => {
    if (!currentUser || currentUser.isAnonymous) {
      addToast?.('Sign in with Google or email to make calls', 'error');
      return;
    }
    if (peer.uid === currentUser.uid) {
      addToast?.('Cannot call yourself', 'error');
      return;
    }
    if (activeCallRef.current || incomingCallRef.current) {
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
      const streams = await webRtcCallService.startOutgoingCall(session, peerCallbacks(callId));
      setLocalStream(streams.localStream);
      setRemoteStream(streams.remoteStream);
      setActiveCall((previous) => previous?.id === callId
        ? { ...previous, status: previous.status === 'connected' ? 'connected' : 'ringing' }
        : previous);

      clearCallTimeout();
      callTimeoutRef.current = window.setTimeout(() => {
        if (activeCallRef.current?.id !== callId || activeCallRef.current.status !== 'ringing') return;
        callNotificationService.stopOutgoingRingback();
        callNotificationService.playCallEnded();
        addToast?.(`${peer.displayName} is unavailable`, 'info');
        void callSignalingService.updateCallStatus(callId, 'missed', { endedReason: 'timeout' });
        recordCallHistory({ ...session, status: 'missed' }, 'missed', 0);
        void webRtcCallService.endCall(callId);
        setLocalStream(null);
        setRemoteStream(null);
        setActiveCall(null);
      }, 35000);
    } catch (error) {
      const wasCancelled = webRtcCallService.wasCallCancelled(callId);
      const message = error instanceof Error ? error.message : 'Failed to start WebRTC call';
      if (!wasCancelled) console.error('[useCalling] Failed to start WebRTC call:', error);
      callNotificationService.stopOutgoingRingback();
      callNotificationService.playCallEnded();
      if (!wasCancelled) addToast?.(message, 'error');
      await webRtcCallService.endCall(callId);
      setLocalStream(null);
      setRemoteStream(null);
      setActiveCall((previous) => previous?.id === callId ? null : previous);
    }
  }, [currentUser, addToast, peerCallbacks, clearCallTimeout, recordCallHistory]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall || !currentUser || currentUser.isAnonymous) return;
    clearCallTimeout();
    callNotificationService.stopIncomingRingtone();
    const call = incomingCall;
    setIncomingCall(null);
    setActiveCall({ ...call, status: 'connecting' });

    try {
      const streams = await webRtcCallService.acceptIncomingCall(call, peerCallbacks(call.id));
      setLocalStream(streams.localStream);
      setRemoteStream(streams.remoteStream);
    } catch (error) {
      const wasCancelled = webRtcCallService.wasCallCancelled(call.id);
      const message = error instanceof Error ? error.message : 'Failed to join WebRTC call';
      if (!wasCancelled) console.error('[useCalling] Accept WebRTC call failed:', error);
      callNotificationService.playCallEnded();
      if (!wasCancelled) {
        addToast?.(message, 'error');
        await callSignalingService.updateCallStatus(call.id, 'failed', { endedReason: 'network_error' });
      }
      await webRtcCallService.endCall(call.id);
      setLocalStream(null);
      setRemoteStream(null);
      setActiveCall((previous) => previous?.id === call.id ? null : previous);
    }
  }, [incomingCall, currentUser, clearCallTimeout, peerCallbacks, addToast]);

  const rejectCall = useCallback(async () => {
    if (!incomingCall) return;
    clearCallTimeout();
    callNotificationService.stopIncomingRingtone();
    const call = incomingCall;
    setIncomingCall(null);
    await callSignalingService.updateCallStatus(call.id, 'rejected', { endedReason: 'declined' });
    recordCallHistory(call, 'rejected', 0);
  }, [incomingCall, clearCallTimeout, recordCallHistory]);

  const endCall = useCallback(async () => {
    const call = activeCallRef.current;
    if (!call) return;
    clearCallTimeout();
    callNotificationService.stopOutgoingRingback();
    callNotificationService.stopIncomingRingtone();
    callNotificationService.playCallEnded();

    const duration = callStartTimeRef.current
      ? Math.max(0, Math.floor((Date.now() - callStartTimeRef.current) / 1000))
      : 0;
    callStartTimeRef.current = null;
    setActiveCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    await webRtcCallService.endCall(call.id);

    await callSignalingService.updateCallStatus(call.id, 'ended', {
      endedReason: duration > 0 ? 'completed' : 'canceled',
      endedAt: Date.now()
    });
    recordCallHistory(call, duration > 0 ? 'completed' : 'canceled', duration);
  }, [clearCallTimeout, recordCallHistory]);

  useEffect(() => () => {
    const call = activeCallRef.current;
    if (call) void webRtcCallService.endCall(call.id);
  }, []);

  return {
    activeCall,
    incomingCall,
    localStream,
    remoteStream,
    callHistory,
    isRinging: activeCall?.status === 'ringing',
    isConnected: activeCall?.status === 'connected',
    startCall,
    acceptCall,
    rejectCall,
    endCall
  };
}
