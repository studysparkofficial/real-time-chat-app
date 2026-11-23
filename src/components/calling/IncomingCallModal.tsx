import React from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { CallSession } from '../../types/chat.types';
import { Avatar } from '../common/Avatar';

interface IncomingCallModalProps {
  incomingCall: CallSession | null;
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  incomingCall,
  onAccept,
  onReject
}) => {
  if (!incomingCall) return null;

  const isVideo = incomingCall.callType === 'video';
  const caller = incomingCall.caller;

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(8px)',
        background: 'rgba(0, 0, 0, 0.75)',
        animation: 'fadeIn 0.25s ease-out'
      }}
    >
      <div
        className="modal-content"
        style={{
          width: '90%',
          maxWidth: '380px',
          textAlign: 'center',
          padding: '32px 24px',
          borderRadius: '24px',
          background: 'var(--bg-secondary, #111827)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.6)',
          position: 'relative',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top ambient color glow */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '200px',
            height: '140px',
            borderRadius: '50%',
            background: isVideo ? 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(16,185,129,0.35) 0%, transparent 70%)',
            pointerEvents: 'none'
          }}
        />

        {/* Pulsing Avatar Container */}
        <div
          style={{
            position: 'relative',
            width: '96px',
            height: '96px',
            margin: '0 auto 20px auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {/* Animated wave rings */}
          <div
            style={{
              position: 'absolute',
              inset: '-12px',
              borderRadius: '50%',
              border: `2px solid ${isVideo ? '#6366f1' : '#10b981'}`,
              opacity: 0.75,
              animation: 'pulseRing 1.8s cubic-bezier(0.215, 0.61, 0.355, 1) infinite'
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: '-24px',
              borderRadius: '50%',
              border: `1.5px solid ${isVideo ? '#6366f1' : '#10b981'}`,
              opacity: 0.4,
              animation: 'pulseRing 1.8s cubic-bezier(0.215, 0.61, 0.355, 1) infinite 0.4s'
            }}
          />

          <Avatar
            src={caller.photoURL}
            name={caller.displayName}
            size="lg"
            className="ring-4 ring-offset-2"
          />
        </div>

        {/* Caller Info */}
        <h3
          style={{
            fontSize: '20px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            marginBottom: '6px',
            letterSpacing: '-0.3px'
          }}
        >
          {caller.displayName}
        </h3>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13.5px',
            color: isVideo ? 'var(--accent-primary, #6366f1)' : '#10b981',
            fontWeight: 600,
            marginBottom: '32px'
          }}
        >
          {isVideo ? <Video size={16} /> : <Phone size={16} />}
          <span>Incoming {isVideo ? 'Video' : 'Voice'} Call...</span>
        </div>

        {/* Action Buttons: Accept / Decline */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '32px'
          }}
        >
          {/* Decline Button (Red) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={onReject}
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 16px rgba(239, 68, 68, 0.4)',
                transition: 'transform 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              title="Decline Call"
            >
              <PhoneOff size={26} />
            </button>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Decline</span>
          </div>

          {/* Accept Button (Green) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={onAccept}
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 16px rgba(16, 185, 129, 0.45)',
                transition: 'transform 0.15s ease',
                animation: 'bounceSubtle 1.2s ease-in-out infinite'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              title="Accept Call"
            >
              {isVideo ? <Video size={26} /> : <Phone size={26} />}
            </button>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#10b981' }}>Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
};
