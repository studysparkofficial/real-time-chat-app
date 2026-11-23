import { useState, useEffect, useRef, useCallback } from 'react';
import { chimeService } from '../services/chimeService';
import { ChimeMeetingCredentials, CallType } from '../types/chat.types';

export interface UseChimeMeetingOptions {
  credentials: ChimeMeetingCredentials | null;
  callType: CallType;
  isConnected: boolean;
  onCallEnded?: () => void;
}

export function useChimeMeeting({
  credentials,
  callType,
  isConnected,
  onCallEnded
}: UseChimeMeetingOptions) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenShareVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'video');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [hasScreenShare, setHasScreenShare] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'poor' | 'reconnecting' | 'disconnected'>('good');
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string>('');

  // Call duration counter
  const [durationSeconds, setDurationSeconds] = useState(0);

  useEffect(() => {
    let timer: number | null = null;
    if (isConnected) {
      timer = window.setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setDurationSeconds(0);
    }
    return () => {
      if (timer !== null) clearInterval(timer);
    };
  }, [isConnected]);

  // Formatted duration: mm:ss or hh:mm:ss
  const formattedDuration = useCallback(() => {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const hours = Math.floor(mins / 60);
    if (hours > 0) {
      const remainingMins = mins % 60;
      return `${hours}:${remainingMins < 10 ? '0' : ''}${remainingMins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }, [durationSeconds]);

  // Set up chime callbacks and bindings
  useEffect(() => {
    chimeService.setCallbacks({
      onAudioVideoDidStart: () => {
        setConnectionQuality('good');
      },
      onAudioVideoDidStop: () => {
        setConnectionQuality('disconnected');
        onCallEnded?.();
      },
      onConnectionQualityChange: (quality) => {
        setConnectionQuality(quality);
      },
      onLocalVideoStateChange: (enabled) => {
        setIsVideoEnabled(enabled);
      },
      onRemoteVideoStateChange: (enabled) => {
        setRemoteHasVideo(enabled);
      },
      onScreenShareStateChange: (active) => {
        setHasScreenShare(active);
      }
    });

    if (audioElementRef.current) {
      chimeService.bindAudioElement(audioElementRef.current);
    }
    if (localVideoRef.current) {
      chimeService.bindLocalVideoElement(localVideoRef.current);
    }
    if (remoteVideoRef.current) {
      chimeService.bindRemoteVideoElement(remoteVideoRef.current);
    }
    if (screenShareVideoRef.current) {
      chimeService.bindScreenShareElement(screenShareVideoRef.current);
    }
  }, [onCallEnded]);

  // Join meeting when credentials are provided
  useEffect(() => {
    if (!credentials) return;

    let isMounted = true;

    chimeService
      .joinMeeting(credentials, { videoEnabled: callType === 'video' })
      .then(async () => {
        if (!isMounted) return;
        setIsVideoEnabled(callType === 'video');
        setIsMuted(false);

        // List cameras
        const cameras = await chimeService.listVideoDevices();
        if (isMounted) {
          setAvailableCameras(cameras);
          if (cameras.length > 0) {
            setActiveCameraId(cameras[0].deviceId);
          }
        }
      })
      .catch((err) => {
        console.error('[useChimeMeeting] Failed to join meeting:', err);
      });

    return () => {
      isMounted = false;
      void chimeService.leaveMeeting();
    };
  }, [credentials, callType]);

  // Re-bind elements when refs change or mount
  const setLocalVideoElement = useCallback((node: HTMLVideoElement | null) => {
    localVideoRef.current = node;
    chimeService.bindLocalVideoElement(node);
  }, []);

  const setRemoteVideoElement = useCallback((node: HTMLVideoElement | null) => {
    remoteVideoRef.current = node;
    chimeService.bindRemoteVideoElement(node);
  }, []);

  const setScreenShareElement = useCallback((node: HTMLVideoElement | null) => {
    screenShareVideoRef.current = node;
    chimeService.bindScreenShareElement(node);
  }, []);

  const setAudioElement = useCallback((node: HTMLAudioElement | null) => {
    audioElementRef.current = node;
    chimeService.bindAudioElement(node);
  }, []);

  // Controls
  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    chimeService.setAudioMuted(nextMuted);
    setIsMuted(nextMuted);
  }, [isMuted]);

  const toggleVideo = useCallback(async () => {
    const nextVideo = !isVideoEnabled;
    const result = await chimeService.setVideoEnabled(nextVideo);
    setIsVideoEnabled(result);
  }, [isVideoEnabled]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await chimeService.stopScreenShare();
      setIsScreenSharing(false);
    } else {
      const started = await chimeService.startScreenShare();
      setIsScreenSharing(started);
    }
  }, [isScreenSharing]);

  const switchCamera = useCallback(async (deviceId: string) => {
    await chimeService.switchCamera(deviceId);
    setActiveCameraId(deviceId);
  }, []);

  return {
    localVideoRef,
    remoteVideoRef,
    screenShareVideoRef,
    audioElementRef,
    setLocalVideoElement,
    setRemoteVideoElement,
    setScreenShareElement,
    setAudioElement,
    isMuted,
    isVideoEnabled,
    isScreenSharing,
    remoteHasVideo,
    hasScreenShare,
    connectionQuality,
    durationSeconds,
    formattedDuration,
    availableCameras,
    activeCameraId,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    switchCamera
  };
}
