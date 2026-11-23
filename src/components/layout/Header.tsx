import React from 'react';
import { MoreVertical, Hash, Moon, Sun, Users, Phone, Video, Clock } from 'lucide-react';
import { ChatRoom, ChatUser } from '../../types/chat.types';
import { Avatar } from '../common/Avatar';

interface HeaderProps {
  currentRoom: ChatRoom;
  directUser?: ChatUser | null;
  onlineCount: number;
  currentUser: ChatUser | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onOpenChannelInfo: () => void;
  onOpenAccountModal: () => void;
  onStartVoiceCall?: (peer: ChatUser) => void;
  onStartVideoCall?: (peer: ChatUser) => void;
  onOpenCallHistory?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRoom,
  directUser = null,
  onlineCount,
  currentUser,
  theme,
  onToggleTheme,
  onToggleSidebar,
  onOpenChannelInfo,
  onOpenAccountModal,
  onStartVoiceCall,
  onStartVideoCall,
  onOpenCallHistory
}) => {
  const isEmoji = currentRoom.icon && currentRoom.icon !== '#';

  return (
    <header className="chat-header">
      {/* Left: 3-Dots Drawer Toggle + JNU Emblem + Channel Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        {/* Dedicated 3-Dots Button (⋮) to toggle left sidebar */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="header-action-btn"
          aria-label="Toggle Channels Menu"
          title="Toggle Channels Menu (⋮)"
        >
          <MoreVertical size={24} />
        </button>

        {/* JNU Official Logo Thumbnail */}
        <img
          src="/jnu-logo.png"
          alt="JNU"
          onClick={onToggleSidebar}
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            objectFit: 'cover',
            border: '2px solid var(--accent-gold, #f59e0b)',
            cursor: 'pointer',
            flexShrink: 0
          }}
          title="JNUverse Campus Hub"
        />

        {/* Channel details or the active one-to-one chat */}
        <div
          className="chat-header-left"
          onClick={directUser ? undefined : onOpenChannelInfo}
          role={directUser ? undefined : 'button'}
          tabIndex={directUser ? undefined : 0}
          title={directUser ? `Private chat with ${directUser.displayName}` : 'Click to view Channel Details & Active Members'}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: 'var(--bg-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isEmoji ? '20px' : '17px',
              color: 'var(--accent-primary)',
              flexShrink: 0
            }}
          >
            {directUser
              ? <Avatar src={directUser.photoURL} name={directUser.displayName} status={directUser.status} size="sm" />
              : isEmoji ? currentRoom.icon : <Hash size={20} />}
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
                  fontSize: '17px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.3px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {directUser?.displayName || currentRoom.name}
              </h2>
            </div>
            <div
              style={{
                fontSize: '12.5px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {directUser ? (
                <>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: directUser.status === 'online' ? 'var(--status-online, #10b981)' : 'var(--text-muted)'
                    }}
                  />
                  <span>{directUser.status === 'online' ? 'Online' : directUser.status === 'offline' ? 'Offline' : directUser.status}</span>
                </>
              ) : (
                <>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: 'var(--status-online, #10b981)'
                    }}
                  />
                  <span>{onlineCount} {onlineCount === 1 ? 'scholar' : 'scholars'} online</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Action Icons: Calling, Channel Info, Call History, Theme Toggle, Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {directUser && onStartVoiceCall && (
          <button
            type="button"
            onClick={() => onStartVoiceCall(directUser)}
            className="header-action-btn"
            title={`Start Voice Call with ${directUser.displayName}`}
            style={{ color: '#10b981' }}
          >
            <Phone size={20} />
          </button>
        )}

        {directUser && onStartVideoCall && (
          <button
            type="button"
            onClick={() => onStartVideoCall(directUser)}
            className="header-action-btn"
            title={`Start Video Call with ${directUser.displayName}`}
            style={{ color: 'var(--accent-primary, #6366f1)' }}
          >
            <Video size={20} />
          </button>
        )}

        {currentUser && onOpenCallHistory && (
          <button
            type="button"
            onClick={onOpenCallHistory}
            className="header-action-btn"
            title="Recent Call History"
          >
            <Clock size={20} />
          </button>
        )}

        {!directUser && <button
          type="button"
          onClick={onOpenChannelInfo}
          className="header-action-btn"
          title="Channel Info & Members"
        >
          <Users size={22} />
        </button>}

        <button
          type="button"
          onClick={onToggleTheme}
          className="header-action-btn"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? <Sun size={22} /> : <Moon size={22} />}
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
            title="Account & Profile Settings"
          >
            <Avatar
              src={currentUser.photoURL}
              name={currentUser.displayName}
              status={currentUser.status}
              size="md"
            />
          </button>
        )}
      </div>
    </header>
  );
};
