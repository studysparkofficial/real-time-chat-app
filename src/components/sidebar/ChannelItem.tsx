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
        padding: '12px 14px',
        borderRadius: '12px',
        border: isActive ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
        background: isActive ? 'var(--bg-card-hover, rgba(55,65,81,0.6))' : 'transparent',
        color: isActive ? 'var(--text-primary, #f8fafc)' : 'var(--text-secondary, #94a3b8)',
        fontWeight: isActive ? 700 : 500,
        fontSize: '15.5px',
        cursor: 'pointer',
        textAlign: 'left',
        minHeight: '50px', // Android touch target
        transition: 'all 0.15s ease',
        userSelect: 'none'
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <span
          style={{
            fontSize: isEmojiIcon ? '20px' : '18px',
            color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          {isEmojiIcon ? room.icon : <Hash size={19} />}
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
            background: 'var(--accent-primary, #2563eb)',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 800,
            padding: '3px 8px',
            borderRadius: '999px',
            minWidth: '22px',
            textAlign: 'center'
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};
