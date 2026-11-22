import React from 'react';
import { MessageSquare, MessageSquarePlus, Plus, X } from 'lucide-react';
import { ChatRoom, ChatUser, DirectConversation } from '../../types/chat.types';
import { Avatar } from '../common/Avatar';
import { ChannelItem } from './ChannelItem';
import { UserProfileBar } from './UserProfileBar';

interface ChannelsSidebarProps {
  rooms: ChatRoom[];
  activeRoomId: string;
  onSelectRoom: (roomId: string) => void;
  currentUser: ChatUser | null;
  unreadCounts: Record<string, number>;
  directConversations: DirectConversation[];
  activeDirectConversationId: string | null;
  unreadDirectConversationIds: Set<string>;
  onSelectDirectConversation: (conversation: DirectConversation) => void;
  onOpenNewDirectMessage: () => void;
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
  directConversations,
  activeDirectConversationId,
  unreadDirectConversationIds,
  onSelectDirectConversation,
  onOpenNewDirectMessage,
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

  const handleSelectDirectConversation = (conversation: DirectConversation) => {
    onSelectDirectConversation(conversation);
    if (isOpenMobile) onCloseSidebar();
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
          background: 'var(--bg-secondary)'
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
              <span className="jnuverse-logo-title">
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
            <div className="jnuverse-logo-sub">
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

        {currentUser && (
          <section style={{ marginTop: '12px' }} aria-label="Direct messages">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 8px 8px 12px',
                color: 'var(--text-muted)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.6px' }}>
                <MessageSquare size={15} />
                <span>DIRECT MESSAGES</span>
              </div>
              <button
                type="button"
                onClick={onOpenNewDirectMessage}
                aria-label="New direct message"
                title="New chat"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-card-hover)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                <MessageSquarePlus size={17} />
              </button>
            </div>

            {directConversations.length === 0 ? (
              <button
                type="button"
                onClick={onOpenNewDirectMessage}
                style={{ width: '100%', padding: '10px 12px', border: 0, borderRadius: '10px', background: 'transparent', color: 'var(--text-muted)', fontSize: '12.5px', textAlign: 'left', cursor: 'pointer' }}
              >
                Start a private conversation
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {directConversations.map((conversation) => {
                  const isActive = conversation.id === activeDirectConversationId;
                  const isUnread = unreadDirectConversationIds.has(conversation.id);
                  const preview = conversation.lastMessage
                    ? `${conversation.lastSenderUid === currentUser.uid ? 'You: ' : ''}${conversation.lastMessage}`
                    : 'Start chatting';
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => handleSelectDirectConversation(conversation)}
                      aria-current={isActive ? 'page' : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        width: '100%',
                        minHeight: '58px',
                        padding: '8px 10px',
                        borderRadius: '12px',
                        border: isActive ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
                        background: isActive ? 'var(--bg-card-hover)' : 'transparent',
                        color: 'var(--text-primary)',
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                    >
                      <Avatar src={conversation.peer.photoURL} name={conversation.peer.displayName} status={conversation.peer.status} size="sm" />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13.5px', fontWeight: isUnread ? 800 : 650 }}>
                          {conversation.peer.displayName}
                        </span>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '3px', color: isUnread ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: '11.5px', fontWeight: isUnread ? 650 : 400 }}>
                          {preview}
                        </span>
                      </span>
                      {isUnread && <span aria-label="Unread message" style={{ width: '9px', height: '9px', flexShrink: 0, borderRadius: '50%', background: 'var(--accent-primary, #2563eb)' }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}
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
