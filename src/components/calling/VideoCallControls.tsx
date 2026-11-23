import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  ScreenShare,
  SwitchCamera,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface VideoCallControlsProps {
  isMuted: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isFullscreen: boolean;
  hasMultipleCameras?: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleFullscreen: () => void;
  onSwitchCamera?: () => void;
  onEndCall: () => void;
}

export const VideoCallControls: React.FC<VideoCallControlsProps> = ({
  isMuted,
  isVideoEnabled,
  isScreenSharing,
  isFullscreen,
  hasMultipleCameras = false,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onToggleFullscreen,
  onSwitchCamera,
  onEndCall
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        padding: '10px 20px',
        borderRadius: '36px',
        background: 'rgba(17, 24, 39, 0.85)',
        backdropFilter: 'blur(14px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6)',
        flexWrap: 'wrap'
      }}
    >
      {/* Microphone Mute */}
      <button
        type="button"
        onClick={onToggleMute}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: isMuted ? '#ef4444' : 'rgba(255, 255, 255, 0.15)',
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease'
        }}
        title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
      >
        {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
      </button>

      {/* Camera On / Off */}
      <button
        type="button"
        onClick={onToggleVideo}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: !isVideoEnabled ? '#ef4444' : 'rgba(255, 255, 255, 0.15)',
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease'
        }}
        title={isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
      >
        {!isVideoEnabled ? <VideoOff size={22} /> : <Video size={22} />}
      </button>

      {/* Switch Camera (if mobile or multiple cameras available) */}
      {hasMultipleCameras && onSwitchCamera && (
        <button
          type="button"
          onClick={onSwitchCamera}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease'
          }}
          title="Switch Camera (Flip)"
        >
          <SwitchCamera size={22} />
        </button>
      )}

      {/* Screen Sharing Toggle */}
      <button
        type="button"
        onClick={onToggleScreenShare}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: isScreenSharing ? 'var(--accent-primary, #6366f1)' : 'rgba(255, 255, 255, 0.15)',
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease'
        }}
        title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
      >
        <ScreenShare size={22} />
      </button>

      {/* Fullscreen Toggle */}
      <button
        type="button"
        onClick={onToggleFullscreen}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.15)',
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease'
        }}
        title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
      >
        {isFullscreen ? <Minimize2 size={22} /> : <Maximize2 size={22} />}
      </button>

      {/* End Call Button */}
      <button
        type="button"
        onClick={onEndCall}
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: '#ef4444',
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 18px rgba(239, 68, 68, 0.45)',
          transition: 'transform 0.15s ease'
        }}
        title="End Call"
      >
        <PhoneOff size={26} />
      </button>
    </div>
  );
};
