import React from 'react';
import { Plus, MessageSquare, Radio } from 'lucide-react';
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
  onCloseMobile: () => void;
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
  onCloseMobile
}) => {
  const handleSelect = (roomId: string) => {
    onSelectRoom(roomId);
    if (isOpenMobile) {
      onCloseMobile();
    }
  };

  return (
    <aside className={`sidebar-container ${isOpenMobile ? 'open' : ''}`}>
      {/* Brand Header */}
      <div
        style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '1px solid var(--border-color)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '9px',
              background: 'var(--accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <Radio size={18} />
          </div>
          <div>
            <span
              style={{
                fontWeight: 700,
                fontSize: '16px',
                letterSpacing: '-0.3px',
                color: 'var(--text-primary)'
              }}
            >
              PulseChat
            </span>
            <span
              style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#10b981',
                marginLeft: '6px',
                boxShadow: '0 0 8px #10b981'
              }}
            />
          </div>
        </div>

        <button
          onClick={onOpenCreateChannel}
          title="Create Channel"
          style={{
            minWidth: '36px',
            minHeight: '36px',
            borderRadius: '8px',
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
          <Plus size={18} />
        </button>
      </div>

      {/* Channels Section */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            padding: '4px 10px 8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <MessageSquare size={13} />
          <span>Channels</span>
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
