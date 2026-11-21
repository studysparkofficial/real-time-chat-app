import React from 'react';
import { UserPresenceStatus } from '../../types/chat.types';

interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'showcase';
  status?: UserPresenceStatus;
  showStatusRing?: boolean;
  className?: string;
}

const SIZE_MAP = {
  xs: 26,
  sm: 36,
  md: 44,
  lg: 52,
  xl: 60,
  showcase: 80
};

const STATUS_COLOR_MAP: Record<UserPresenceStatus, string> = {
  online: 'var(--status-online, #10b981)',
  away: 'var(--status-away, #f59e0b)',
  busy: 'var(--status-busy, #ef4444)',
  offline: 'var(--status-offline, #64748b)'
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name = 'Scholar',
  size = 'md',
  status,
  showStatusRing = false,
  className = ''
}) => {
  const pixelSize = SIZE_MAP[size];
  const isEmoji = src && src.length <= 4 && !src.startsWith('http') && !src.startsWith('data:');
  const initial = name ? name.charAt(0).toUpperCase() : '?';

  const dotSize = Math.max(9, Math.round(pixelSize * 0.28));
  const statusColor = status ? STATUS_COLOR_MAP[status] : undefined;

  return (
    <div
      style={{
        position: 'relative',
        width: `${pixelSize}px`,
        height: `${pixelSize}px`,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        boxShadow: showStatusRing && status ? `0 0 0 3px ${statusColor}40` : undefined
      }}
      className={className}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #132036 0%, #1e3a8a 100%)',
          color: '#f8fafc',
          fontWeight: 700,
          fontSize: `${Math.round(pixelSize * 0.44)}px`,
          userSelect: 'none',
          border: '1.5px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        {src && !isEmoji && (src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:')) ? (
          <img
            src={src}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        ) : isEmoji ? (
          <span>{src}</span>
        ) : (
          <span>{initial}</span>
        )}
      </div>

      {status && (
        <span
          title={`Status: ${status}`}
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: `${dotSize}px`,
            height: `${dotSize}px`,
            borderRadius: '50%',
            backgroundColor: statusColor,
            border: '2px solid var(--bg-secondary, #0d1527)',
            boxSizing: 'content-box'
          }}
        />
      )}
    </div>
  );
};
