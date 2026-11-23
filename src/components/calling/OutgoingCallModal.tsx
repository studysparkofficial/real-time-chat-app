import React from 'react';
import { PhoneOff, Video, Phone } from 'lucide-react';
import { CallSession } from '../../types/chat.types';
import { Avatar } from '../common/Avatar';

interface OutgoingCallModalProps {
  activeCall: CallSession | null;
  onCancel: () => void;
}

export const OutgoingCallModal: React.FC<OutgoingCallModalProps> = ({
  activeCall,
  onCancel
}) => {
  if (!activeCall || activeCall.status === 'connected') return null;

  const isVideo = activeCall.callType === 'video';
  const recipient = activeCall.recipient;

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
          padding: '36px 24px',
          borderRadius: '24px',
          background: 'var(--bg-secondary, #111827)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.6)',
          position: 'relative',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
          <div
            style={{
              position: 'absolute',
              inset: '-12px',
              borderRadius: '50%',
              border: `2px solid ${isVideo ? '#6366f1' : '#10b981'}`,
              opacity: 0.7,
              animation: 'pulseRing 1.8s cubic-bezier(0.215, 0.61, 0.355, 1) infinite'
            }}
          />

          <Avatar
            src={recipient.photoURL}
            name={recipient.displayName}
            size="lg"
            className="ring-4 ring-offset-2"
          />
        </div>

        {/* Recipient Details */}
        <h3
          style={{
            fontSize: '20px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            marginBottom: '6px',
            letterSpacing: '-0.3px'
          }}
        >
          {recipient.displayName}
        </h3>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13.5px',
            color: 'var(--text-muted)',
            fontWeight: 600,
            marginBottom: '32px'
          }}
        >
          {isVideo ? <Video size={16} color="var(--accent-primary)" /> : <Phone size={16} color="#10b981" />}
          <span>
            {activeCall.status === 'initiating'
              ? 'Starting call...'
              : activeCall.status === 'connecting'
              ? 'Connecting...'
              : 'Ringing...'}
          </span>
        </div>

        {/* End Call / Cancel Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={onCancel}
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
            title="Cancel Call"
          >
            <PhoneOff size={26} />
          </button>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Cancel</span>
        </div>
      </div>
    </div>
  );
};
