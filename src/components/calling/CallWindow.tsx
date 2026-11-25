import React, { useState, useRef, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  User,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { CallSession } from '../../types/chat.types';
import { useWebRtcMeeting } from '../../hooks/useWebRtcMeeting';
import { Avatar } from '../common/Avatar';
import { VoiceCallControls } from './VoiceCallControls';
import { VideoCallControls } from './VideoCallControls';

interface CallWindowProps {
  activeCall: CallSession;
  currentUserId: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEndCall: () => void;
}

export const CallWindow: React.FC<CallWindowProps> = ({
  activeCall,
  currentUserId,
  localStream,
  remoteStream,
  onEndCall
}) => {
  const isVideo = activeCall.callType === 'video';
  const isCaller = activeCall.caller.uid === currentUserId;
  const peer = isCaller ? activeCall.recipient : activeCall.caller;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
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
    formattedDuration,
    availableCameras,
    activeCameraId,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    switchCamera
  } = useWebRtcMeeting({
    callId: activeCall.id,
    callType: activeCall.callType,
    currentUserId,
    localStream,
    remoteStream,
    isConnected: activeCall.status === 'connected',
    remoteScreenSharing: Boolean(activeCall.screenShareBy && activeCall.screenShareBy !== currentUserId)
  });

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleSwitchCamera = () => {
    if (availableCameras.length <= 1) return;
    const currentIndex = availableCameras.findIndex((c) => c.deviceId === activeCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    void switchCamera(availableCameras[nextIndex].deviceId).catch((error) => {
      console.warn('[CallWindow] Camera switch failed:', error);
    });
  };

  const handleToggleScreenShare = () => {
    void toggleScreenShare().catch((error) => {
      console.warn('[CallWindow] Screen sharing could not start:', error);
    });
  };

  return (
    <div
      ref={containerRef}
      className="call-window-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#070b14',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        color: '#ffffff',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {/* Video elements are muted so remote speech plays only once through audio. */}
      <audio ref={setAudioElement} autoPlay playsInline />

      {/* Top Bar: Peer Name, Call Timer, Connection Quality Pill */}
      <header
        style={{
          position: 'relative',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Avatar
            src={peer.photoURL}
            name={peer.displayName}
            size="sm"
          />
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
              {peer.displayName}
            </h3>
            <div
              style={{
                fontSize: '12px',
                color: 'rgba(255, 255, 255, 0.75)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.5px'
              }}
            >
              {formattedDuration()}
            </div>
          </div>
        </div>

        {/* Network & Call Quality Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.12)',
              fontSize: '11px',
              fontWeight: 600,
              backdropFilter: 'blur(8px)'
            }}
          >
            {connectionQuality === 'good' ? (
              <Wifi size={14} color="#10b981" />
            ) : (
              <WifiOff size={14} color="#f59e0b" />
            )}
            <span
              style={{
                color:
                  connectionQuality === 'good'
                    ? '#10b981'
                    : connectionQuality === 'poor'
                    ? '#f59e0b'
                    : '#ef4444'
              }}
            >
              {connectionQuality === 'good'
                ? 'Encrypted'
                : connectionQuality === 'poor'
                ? 'Unstable Network'
                : 'Reconnecting...'}
            </span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: '#ffffff',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      {/* Main View Area (Remote Video / Screen Share / Voice Avatar Card) */}
      <main
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        }}
      >
        {/* Screen Share Display if active */}
        {hasScreenShare && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              background: '#000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <video
              ref={setScreenShareElement}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain'
              }}
            />
          </div>
        )}

        {/* Remote Video Stream if enabled */}
        {isVideo && remoteHasVideo && !hasScreenShare && (
          <video
            ref={setRemoteVideoElement}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        )}

        {/* Voice Call or Remote Camera Off: Full Animated Caller Card */}
        {(!isVideo || (!remoteHasVideo && !hasScreenShare)) && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '24px'
            }}
          >
            {/* Glowing Avatar */}
            <div
              style={{
                position: 'relative',
                width: '120px',
                height: '120px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: '-10px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)',
                  animation: 'pulseRing 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite'
                }}
              />
              <Avatar
                src={peer.photoURL}
                name={peer.displayName}
                size="lg"
              />
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff', margin: '0 0 6px 0' }}>
              {peer.displayName}
            </h2>
            <p style={{ fontSize: '13.5px', color: 'rgba(255, 255, 255, 0.6)', margin: 0 }}>
              {isVideo ? 'Camera is off' : 'Connected · Voice call'}
            </p>
          </div>
        )}

        {/* Picture-in-Picture Local Camera View */}
        {isVideo && (
          <div
            style={{
              position: 'absolute',
              bottom: '96px',
              right: '20px',
              width: '130px',
              height: '180px',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              border: '2px solid rgba(255, 255, 255, 0.25)',
              background: '#1f2937',
              zIndex: 30,
              transition: 'transform 0.2s ease',
              display: isVideoEnabled ? 'block' : 'none'
            }}
          >
            <video
              ref={setLocalVideoElement}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)' // Mirror local view
              }}
            />
          </div>
        )}
      </main>

      {/* Floating Call Controls Dock */}
      <footer
        style={{
          position: 'relative',
          zIndex: 25,
          padding: '16px 24px 32px 24px',
          display: 'flex',
          justifyContent: 'center',
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)'
        }}
      >
        {isVideo ? (
          <VideoCallControls
            isMuted={isMuted}
            isVideoEnabled={isVideoEnabled}
            isScreenSharing={isScreenSharing}
            isFullscreen={isFullscreen}
            hasMultipleCameras={availableCameras.length > 1}
            onToggleMute={toggleMute}
            onToggleVideo={toggleVideo}
            onToggleScreenShare={handleToggleScreenShare}
            onToggleFullscreen={toggleFullscreen}
            onSwitchCamera={handleSwitchCamera}
            onEndCall={onEndCall}
          />
        ) : (
          <VoiceCallControls
            isMuted={isMuted}
            onToggleMute={toggleMute}
            onEndCall={onEndCall}
          />
        )}
      </footer>
    </div>
  );
};
