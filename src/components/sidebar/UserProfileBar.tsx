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
          padding: '14px 16px',
          borderTop: '1px solid var(--border-color)',
          background: 'rgba(0, 0, 0, 0.15)'
        }}
      >
        <button
          onClick={onOpenAuthModal}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '12px 16px',
            background: 'var(--accent-gradient)',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '15px',
            minHeight: '48px',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <LogIn size={20} /> Sign In to JNUverse
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(0, 0, 0, 0.15)'
      }}
    >
      <div
        onClick={onOpenAccountModal}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          cursor: 'pointer',
          flex: 1,
          minWidth: 0,
          padding: '4px 6px',
          borderRadius: '10px',
          transition: 'background 0.15s ease'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        title="Scholar Profile & Settings"
      >
        <Avatar
          src={user.photoURL}
          name={user.displayName}
          status={user.status}
          size="md"
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: '14.5px',
              fontWeight: 700,
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
              fontSize: '12px',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {user.bio || 'JNU Scholar'}
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
          minWidth: '44px',
          minHeight: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '10px',
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
        <Settings size={20} />
      </button>
    </div>
  );
};
