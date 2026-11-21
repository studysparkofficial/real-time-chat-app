import React from 'react';
import { X, Hash, Activity, Users, Shield, Radio } from 'lucide-react';
import { ChatRoom, ChatUser } from '../../types/chat.types';
import { Avatar } from '../common/Avatar';

interface ChannelInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: ChatRoom;
  onlineMembers: ChatUser[];
  latencyMs: number;
}

export const ChannelInfoModal: React.FC<ChannelInfoModalProps> = ({
  isOpen,
  onClose,
  room,
  onlineMembers,
  latencyMs
}) => {
  if (!isOpen) return null;

  const isEmoji = room.icon && room.icon !== '#';

  // Latency quality color
  const latencyColor =
    latencyMs < 50 ? '#10b981' : latencyMs < 120 ? '#f59e0b' : '#ef4444';
  const latencyStatusText =
    latencyMs < 50 ? 'Optimal Connection' : latencyMs < 120 ? 'Good' : 'Elevated Latency';

  return (
    <div className="modal-overlay as-sheet" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '440px' }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'var(--bg-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isEmoji ? '16px' : '14px',
                color: 'var(--accent-primary)'
              }}
            >
              {isEmoji ? room.icon : <Hash size={18} />}
            </div>
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {room.name}
              </h3>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                #{room.slug}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Channel Topic Card */}
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--bg-card)',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            marginBottom: '16px'
          }}
        >
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
            CHANNEL TOPIC
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
            {room.topic || 'No topic set for this room.'}
          </p>
        </div>

        {/* Live Network Latency & Architecture Stats */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'var(--bg-input)',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            marginBottom: '18px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} color={latencyColor} />
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>STREAM LATENCY</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: latencyColor }}>
                {latencyMs} ms · {latencyStatusText}
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              background: 'var(--bg-card-hover)',
              padding: '4px 8px',
              borderRadius: '6px'
            }}
          >
            <Radio size={12} color="#10b981" />
            <span>Multi-Tab Sync</span>
          </div>
        </div>

        {/* Active Members List */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12.5px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase'
              }}
            >
              <Users size={14} />
              <span>ACTIVE MEMBERS ({onlineMembers.length})</span>
            </div>
          </div>

          <div
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            {onlineMembers.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                No other members currently active
              </div>
            ) : (
              onlineMembers.map((member) => (
                <div
                  key={member.uid}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '6px 8px',
                    borderRadius: '8px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <Avatar
                    src={member.photoURL}
                    name={member.displayName}
                    status={member.status}
                    size="sm"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '13.5px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {member.displayName}
                      {member.isAnonymous && (
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: 'rgba(255,255,255,0.08)',
                            color: 'var(--text-muted)'
                          }}
                        >
                          Guest
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '11.5px',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {member.bio || 'PulseChat Member'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
