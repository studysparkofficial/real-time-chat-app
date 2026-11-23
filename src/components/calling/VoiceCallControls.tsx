import React from 'react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';

interface VoiceCallControlsProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onEndCall: () => void;
}

export const VoiceCallControls: React.FC<VoiceCallControlsProps> = ({
  isMuted,
  onToggleMute,
  onEndCall
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        padding: '12px 24px',
        borderRadius: '32px',
        background: 'rgba(17, 24, 39, 0.85)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)'
      }}
    >
      {/* Microphone Mute Toggle */}
      <button
        type="button"
        onClick={onToggleMute}
        style={{
          width: '52px',
          height: '52px',
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
        title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
      >
        {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
      </button>

      {/* End Call Button */}
      <button
        type="button"
        onClick={onEndCall}
        style={{
          width: '58px',
          height: '58px',
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
