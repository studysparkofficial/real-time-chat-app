import React from 'react';
import { Hash } from 'lucide-react';
import { ChatRoom } from '../../types/chat.types';

interface ChannelItemProps {
  room: ChatRoom;
  isActive: boolean;
  unreadCount?: number;
  onSelect: (roomId: string) => void;
}

export const ChannelItem: React.FC<ChannelItemProps> = ({
  room,
  isActive,
  unreadCount = 0,
  onSelect
}) => {
  const isEmojiIcon = room.icon && room.icon !== '#';

  return (
    <button
      type="button"
      onClick={() => onSelect(room.id)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderRadius: '10px',
        border: 'none',
        background: isActive ? 'var(--bg-card-hover, rgba(55,65,81,0.6))' : 'transparent',
        color: isActive ? 'var(--text-primary, #f8fafc)' : 'var(--text-secondary, #94a3b8)',
        fontWeight: isActive ? 600 : 400,
        fontSize: '14.5px',
        cursor: 'pointer',
        textAlign: 'left',
        minHeight: '44px', // Android touch target minimum
        transition: 'all 0.15s ease',
        userSelect: 'none'
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <span
          style={{
            fontSize: isEmojiIcon ? '16px' : '14px',
            color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          {isEmojiIcon ? room.icon : <Hash size={17} />}
        </span>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {room.name}
        </span>
      </div>

      {unreadCount > 0 && (
        <span
          style={{
            background: 'var(--accent-primary, #3b82f6)',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: '999px',
            minWidth: '20px',
            textAlign: 'center'
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};
