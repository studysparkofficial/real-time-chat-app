import React from 'react';
import { Plus, MessageSquare, X } from 'lucide-react';
import { ChatRoom, ChatUser } from '../../types/chat.types';
import { ChannelItem } from './ChannelItem';
import { UserProfileBar } from './UserProfileBar';

interface ChannelsSidebarProps {
  rooms: ChatRoom[];
  activeRoomId: string;
  onSelectRoom: (roomId: string) => void;
  currentUser: ChatUser | null;
  unreadCounts: Record<string, number>;
  onOpenCreateChannel: () => void;
  onOpenAccountModal: () => void;
  onOpenAuthModal: () => void;
  isOpenMobile: boolean;
  isDesktopOpen: boolean;
  onCloseSidebar: () => void;
}

export const ChannelsSidebar: React.FC<ChannelsSidebarProps> = ({
  rooms,
  activeRoomId,
  onSelectRoom,
  currentUser,
  unreadCounts,
  onOpenCreateChannel,
  onOpenAccountModal,
  onOpenAuthModal,
  isOpenMobile,
  isDesktopOpen,
  onCloseSidebar
}) => {
  const handleSelect = (roomId: string) => {
    onSelectRoom(roomId);
    if (isOpenMobile) {
      onCloseSidebar();
    }
  };

  return (
    <aside
      className={`sidebar-container ${isOpenMobile ? 'open' : ''} ${
        !isDesktopOpen ? 'desktop-closed' : ''
      }`}
    >
      {/* Brand Header with JNU Seal */}
      <div
        style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '1px solid var(--border-color)',
          background: 'rgba(13, 21, 39, 0.95)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src="/jnu-logo.png"
            alt="JNU Seal"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid var(--accent-gold, #f59e0b)',
              boxShadow: 'var(--shadow-sm)'
            }}
          />
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '18px',
                  letterSpacing: '-0.3px',
                  color: 'var(--text-primary)'
                }}
              >
                JNUverse
              </span>
              <span
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 8px #10b981'
                }}
              />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--accent-gold)', fontWeight: 600 }}>
              JNU CAMPUS HUB
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* New Channel Button */}
          <button
            onClick={onOpenCreateChannel}
            title="Create JNU Channel"
            style={{
              minWidth: '40px',
              minHeight: '40px',
              borderRadius: '10px',
              background: 'var(--bg-card-hover)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
          >
            <Plus size={20} />
          </button>

          {/* Dedicated Close Button (X) to close sidebar on all screen sizes */}
          <button
            onClick={onCloseSidebar}
            title="Close Channels Menu"
            style={{
              minWidth: '40px',
              minHeight: '40px',
              borderRadius: '10px',
              background: 'var(--bg-card-hover)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Channels Section */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}
      >
        <div
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            padding: '6px 12px 8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <MessageSquare size={15} />
          <span>CAMPUS CHANNELS</span>
        </div>

        {rooms.map((room) => (
          <ChannelItem
            key={room.id}
            room={room}
            isActive={room.id === activeRoomId}
            unreadCount={unreadCounts[room.id] || 0}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {/* Bottom User Profile Section */}
      <UserProfileBar
        user={currentUser}
        onOpenAccountModal={onOpenAccountModal}
        onOpenAuthModal={onOpenAuthModal}
      />
    </aside>
  );
};
