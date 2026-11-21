import React from 'react';
import { Settings, LogIn } from 'lucide-react';
import { ChatUser } from '../../types/chat.types';
import { Avatar } from '../common/Avatar';

interface UserProfileBarProps {
  user: ChatUser | null;
  onOpenAccountModal: () => void;
  onOpenAuthModal: () => void;
}

export const UserProfileBar: React.FC<UserProfileBarProps> = ({
  user,
  onOpenAccountModal,
  onOpenAuthModal
}) => {
  if (!user) {
    return (
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-color)',
          background: 'rgba(0, 0, 0, 0.1)'
        }}
      >
        <button
          onClick={onOpenAuthModal}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 14px',
            background: 'var(--accent-gradient)',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '14px',
            minHeight: '44px'
          }}
        >
          <LogIn size={18} /> Sign In to PulseChat
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(0, 0, 0, 0.1)'
      }}
    >
      <div
        onClick={onOpenAccountModal}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          flex: 1,
          minWidth: 0,
          padding: '4px 6px',
          borderRadius: '8px',
          transition: 'background 0.15s ease'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        title="View Profile & Settings"
      >
        <Avatar
          src={user.photoURL}
          name={user.displayName}
          status={user.status}
          size="sm"
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: '13.5px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {user.displayName}
          </div>
          <div
            style={{
              fontSize: '11.5px',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {user.bio || `@${user.uid.slice(0, 6)}`}
          </div>
        </div>
      </div>

      <button
        onClick={onOpenAccountModal}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          minWidth: '40px',
          minHeight: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '8px',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--text-primary)';
          e.currentTarget.style.background = 'var(--bg-card-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-secondary)';
          e.currentTarget.style.background = 'transparent';
        }}
        title="Settings"
      >
        <Settings size={18} />
      </button>
    </div>
  );
};
