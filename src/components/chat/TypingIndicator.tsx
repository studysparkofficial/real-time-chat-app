import React from 'react';
import { TypingUser } from '../../types/chat.types';

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ typingUsers }) => {
  if (!typingUsers || typingUsers.length === 0) return null;

  const text =
    typingUsers.length === 1
      ? `${typingUsers[0].displayName} is typing`
      : typingUsers.length === 2
      ? `${typingUsers[0].displayName} and ${typingUsers[1].displayName} are typing`
      : `${typingUsers.length} people are typing`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 18px',
        fontSize: '12.5px',
        color: 'var(--text-muted)',
        minHeight: '26px',
        animation: 'fadeIn 0.2s ease'
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
        <span
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: 'var(--accent-primary)',
            animation: 'pulseBlink 1s infinite'
          }}
        />
        <span
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: 'var(--accent-primary)',
            animation: 'pulseBlink 1s infinite 0.2s'
          }}
        />
        <span
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: 'var(--accent-primary)',
            animation: 'pulseBlink 1s infinite 0.4s'
          }}
        />
      </div>
      <span>{text}…</span>
    </div>
  );
};
