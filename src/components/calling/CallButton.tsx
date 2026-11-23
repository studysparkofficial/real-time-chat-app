import React from 'react';
import { Phone, Video } from 'lucide-react';
import { ChatUser, CallType } from '../../types/chat.types';

interface CallButtonProps {
  peer: ChatUser;
  callType: CallType;
  onStartCall: (peer: ChatUser, callType: CallType) => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const CallButton: React.FC<CallButtonProps> = ({
  peer,
  callType,
  onStartCall,
  disabled = false,
  className = '',
  size = 'md'
}) => {
  const isVideo = callType === 'video';
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 22 : 18;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onStartCall(peer, callType);
  };

  const title = `Start ${isVideo ? 'Video' : 'Voice'} Call with ${peer.displayName}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`header-action-btn ${className}`}
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: size === 'sm' ? '6px' : '8px',
        borderRadius: '10px',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-color)',
        color: isVideo ? 'var(--accent-primary, #6366f1)' : '#10b981',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'transform 0.15s ease, background 0.15s ease'
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.background = 'var(--bg-card-hover)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.background = 'var(--bg-tertiary)';
      }}
    >
      {isVideo ? <Video size={iconSize} /> : <Phone size={iconSize} />}
    </button>
  );
};
