import { useState, useEffect, useRef, useCallback } from 'react';
import { callSignalingService } from '../services/callSignalingService';
import { webRtcCallService } from '../services/webrtcCallService';
import { CallType } from '../types/chat.types';

interface UseWebRtcMeetingOptions {
  callId: string;
  callType: CallType;
  currentUserId: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isConnected: boolean;
  remoteScreenSharing: boolean;
}

export function useWebRtcMeeting({
  callId,
  callType,
  currentUserId,
  localStream,
  remoteStream,
  isConnected,
  remoteScreenSharing
}: UseWebRtcMeetingOptions) {
  const [localPreviewStream, setLocalPreviewStream] = useState<MediaStream | null>(localStream);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'video');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const displayTrackRef = useRef<MediaStreamTrack | null>(null);

  useEffect(() => {
    setLocalPreviewStream(localStream ? new MediaStream(localStream.getTracks()) : null);
    setIsMuted(false);
    setIsVideoEnabled(callType === 'video');
  }, [localStream, callType]);

  useEffect(() => {
    let mounted = true;
    void navigator.mediaDevices?.enumerateDevices().then((devices) => {
      if (!mounted) return;
      const cameras = devices.filter((device) => device.kind === 'videoinput');
      setAvailableCameras(cameras);
      setActiveCameraId(localStream?.getVideoTracks()[0]?.getSettings().deviceId || cameras[0]?.deviceId || '');
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [localStream]);

  useEffect(() => {
    let timer: number | null = null;
    if (isConnected) {
      timer = window.setInterval(() => setDurationSeconds((previous) => previous + 1), 1000);
    } else {
      setDurationSeconds(0);
    }
    return () => { if (timer !== null) window.clearInterval(timer); };
  }, [isConnected]);

  useEffect(() => {
    if (!remoteStream) {
      setRemoteHasVideo(false);
      return;
    }
    const tracks = remoteStream.getVideoTracks();
    const refresh = () => setRemoteHasVideo(tracks.some((track) => track.readyState === 'live' && !track.muted));
    tracks.forEach((track) => {
      track.addEventListener('mute', refresh);
      track.addEventListener('unmute', refresh);
      track.addEventListener('ended', refresh);
    });
    refresh();
    return () => tracks.forEach((track) => {
      track.removeEventListener('mute', refresh);
      track.removeEventListener('unmute', refresh);
      track.removeEventListener('ended', refresh);
    });
  }, [remoteStream]);

  useEffect(() => () => {
    displayTrackRef.current?.stop();
    displayTrackRef.current = null;
  }, []);

  const formattedDuration = useCallback(() => {
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}:${remainingMinutes < 10 ? '0' : ''}${remainingMinutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }
    return `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }, [durationSeconds]);

  const setLocalVideoElement = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      node.srcObject = localPreviewStream;
      void node.play().catch(() => undefined);
    }
  }, [localPreviewStream]);

  const setRemoteVideoElement = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      node.srcObject = remoteStream;
      void node.play().catch(() => undefined);
    }
  }, [remoteStream]);

  const setScreenShareElement = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      node.srcObject = remoteStream;
      void node.play().catch(() => undefined);
    }
  }, [remoteStream]);

  const setAudioElement = useCallback((node: HTMLAudioElement | null) => {
    if (node) {
      node.srcObject = remoteStream;
      void node.play().catch(() => undefined);
    }
  }, [remoteStream]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    localStream?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setIsMuted(nextMuted);
  }, [isMuted, localStream]);

  const toggleVideo = useCallback(() => {
    const nextEnabled = !isVideoEnabled;
    localStream?.getVideoTracks().forEach((track) => { track.enabled = nextEnabled; });
    setIsVideoEnabled(nextEnabled);
  }, [isVideoEnabled, localStream]);

  const stopScreenShare = useCallback(async () => {
    const displayTrack = displayTrackRef.current;
    if (!displayTrack) return;
    displayTrackRef.current = null;
    const cameraTrack = localStream?.getVideoTracks()[0];
    try {
      if (cameraTrack) {
        await webRtcCallService.replaceVideoTrack(callId, cameraTrack);
        setLocalPreviewStream(new MediaStream(localStream?.getTracks() || []));
      }
      await callSignalingService.setScreenShare(callId, null);
    } catch (error) {
      console.warn('[WebRTC] Could not stop screen sharing cleanly:', error);
    }
    displayTrack.stop();
    setIsScreenSharing(false);
  }, [callId, localStream]);

  const toggleScreenShare = useCallback(async () => {
    if (displayTrackRef.current) {
      await stopScreenShare();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen sharing is not supported in this browser.');
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const displayTrack = displayStream.getVideoTracks()[0];
    if (!displayTrack) return;
    let replacedSenderTrack = false;
    try {
      await webRtcCallService.replaceVideoTrack(callId, displayTrack);
      replacedSenderTrack = true;
      displayTrackRef.current = displayTrack;
      setLocalPreviewStream(new MediaStream([...((localStream?.getAudioTracks()) || []), displayTrack]));
      setIsScreenSharing(true);
      await callSignalingService.setScreenShare(callId, currentUserId);
      displayTrack.onended = () => { void stopScreenShare(); };
    } catch (error) {
      const cameraTrack = localStream?.getVideoTracks()[0];
      if (replacedSenderTrack && cameraTrack) {
        await webRtcCallService.replaceVideoTrack(callId, cameraTrack).catch(() => undefined);
      }
      displayTrackRef.current = null;
      displayTrack.stop();
      setLocalPreviewStream(localStream ? new MediaStream(localStream.getTracks()) : null);
      setIsScreenSharing(false);
      throw error;
    }
  }, [callId, currentUserId, localStream, stopScreenShare]);

  const switchCamera = useCallback(async (deviceId: string) => {
    if (!localStream || !navigator.mediaDevices?.getUserMedia) return;
    if (displayTrackRef.current) await stopScreenShare();
    const capture = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false
    });
    const nextTrack = capture.getVideoTracks()[0];
    if (!nextTrack) return;
    try {
      await webRtcCallService.replaceVideoTrack(callId, nextTrack);
      const previousTrack = localStream.getVideoTracks()[0];
      if (previousTrack) localStream.removeTrack(previousTrack);
      localStream.addTrack(nextTrack);
      previousTrack?.stop();
      setLocalPreviewStream(new MediaStream(localStream.getTracks()));
      setActiveCameraId(deviceId);
    } catch (error) {
      nextTrack.stop();
      throw error;
    }
  }, [callId, localStream, stopScreenShare]);

  const connectionQuality = isConnected ? 'good' : 'reconnecting';

  return {
    setLocalVideoElement,
    setRemoteVideoElement,
    setScreenShareElement,
    setAudioElement,
    isMuted,
    isVideoEnabled,
    isScreenSharing,
    remoteHasVideo,
    hasScreenShare: remoteScreenSharing,
    connectionQuality,
    formattedDuration,
    availableCameras,
    activeCameraId,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    stopScreenShare,
    switchCamera
  };
}
