import React from 'react';
import { MoreVertical, Hash, Info, Moon, Sun, Users } from 'lucide-react';
import { ChatRoom, ChatUser } from '../../types/chat.types';
import { Avatar } from '../common/Avatar';

interface HeaderProps {
  currentRoom: ChatRoom;
  onlineCount: number;
  currentUser: ChatUser | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onOpenChannelInfo: () => void;
  onOpenAccountModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRoom,
  onlineCount,
  currentUser,
  theme,
  onToggleTheme,
  onToggleSidebar,
  onOpenChannelInfo,
  onOpenAccountModal
}) => {
  const isEmoji = currentRoom.icon && currentRoom.icon !== '#';

  return (
    <header className="chat-header">
      {/* Left: 3-Dots Drawer Toggle + Channel Title & Subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        {/* Dedicated 3-Dots Button (⋮) */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="header-action-btn"
          aria-label="Toggle Channels Menu"
          title="Channels Menu (⋮)"
        >
          <MoreVertical size={20} />
        </button>

        {/* Tapping channel header triggers Channel Info & Active Members Sheet */}
        <div
          className="chat-header-left"
          onClick={onOpenChannelInfo}
          role="button"
          tabIndex={0}
          title="Click to view Channel Details & Active Members"
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'var(--bg-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isEmoji ? '18px' : '15px',
              color: 'var(--accent-primary)',
              flexShrink: 0
            }}
          >
            {isEmoji ? currentRoom.icon : <Hash size={18} />}
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.2px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {currentRoom.name}
              </h2>
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--status-online, #10b981)'
                }}
              />
              <span>{onlineCount} {onlineCount === 1 ? 'member' : 'members'} online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Action Icons: Channel Info, Theme Toggle, Profile Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          type="button"
          onClick={onOpenChannelInfo}
          className="header-action-btn"
          title="Channel Info & Members"
        >
          <Users size={19} />
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="header-action-btn"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>

        {currentUser && (
          <button
            type="button"
            onClick={onOpenAccountModal}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: '4px'
            }}
            title="Account Settings"
          >
            <Avatar
              src={currentUser.photoURL}
              name={currentUser.displayName}
              status={currentUser.status}
              size="sm"
            />
          </button>
        )}
      </div>
    </header>
  );
};
