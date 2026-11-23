import React from 'react';
import { X, Hash, Activity, Users, Radio, MapPin, Phone, Video } from 'lucide-react';
import { ChatRoom, ChatUser, CallType } from '../../types/chat.types';
import { Avatar } from '../common/Avatar';

interface ChannelInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: ChatRoom;
  onlineMembers: ChatUser[];
  latencyMs: number;
  currentUser?: ChatUser | null;
  onStartCall?: (peer: ChatUser, type: CallType) => void;
}

export const ChannelInfoModal: React.FC<ChannelInfoModalProps> = ({
  isOpen,
  onClose,
  room,
  onlineMembers,
  latencyMs,
  currentUser,
  onStartCall
}) => {
  if (!isOpen) return null;

  const isEmoji = room.icon && room.icon !== '#';

  const latencyColor =
    latencyMs < 50 ? '#10b981' : latencyMs < 120 ? '#f59e0b' : '#ef4444';
  const latencyStatusText =
    latencyMs < 50 ? 'Optimal Network' : latencyMs < 120 ? 'Good' : 'Lag Warning';

  return (
    <div className="modal-overlay as-sheet" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '460px' }}
      >
        {/* Mobile Drag Indicator */}
        <div
          style={{
            width: '40px',
            height: '4px',
            borderRadius: '2px',
            background: 'var(--border-color)',
            margin: '0 auto 16px auto'
          }}
        />

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '18px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'var(--bg-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isEmoji ? '22px' : '18px',
                color: 'var(--accent-primary)',
                flexShrink: 0
              }}
            >
              {isEmoji ? room.icon : <Hash size={20} />}
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                #{room.name}
              </h3>
              <div style={{ fontSize: '12px', color: 'var(--accent-gold)', fontWeight: 600 }}>
                JNUverse Campus Stream
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
              padding: '6px'
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Channel Topic Card */}
        <div
          style={{
            padding: '14px 16px',
            background: 'var(--bg-card)',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
            marginBottom: '16px'
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <MapPin size={13} color="var(--accent-gold)" />
            <span>CHANNEL TOPIC</span>
          </div>
          <p style={{ fontSize: '14.5px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {room.topic || 'General university discussion channel for JNU scholars.'}
          </p>
        </div>

        {/* Live Network Latency & Architecture Stats */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'var(--bg-input)',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
            marginBottom: '20px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={20} color={latencyColor} />
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                CAMPUS LATENCY
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: latencyColor }}>
                {latencyMs} ms · {latencyStatusText}
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#10b981',
              background: 'rgba(16, 185, 129, 0.12)',
              padding: '6px 10px',
              borderRadius: '8px'
            }}
          >
            <Radio size={13} color="#10b981" />
            <span>Real-Time Sync</span>
          </div>
        </div>

        {/* Active Members List */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                fontWeight: 800,
                color: 'var(--text-muted)',
                textTransform: 'uppercase'
              }}
            >
              <Users size={16} />
              <span>ONLINE SCHOLARS & STUDENTS ({onlineMembers.length})</span>
            </div>
          </div>

          <div
            style={{
              maxHeight: '280px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            {onlineMembers.length === 0 ? (
              <div style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                No other scholars currently active in this channel
              </div>
            ) : (
              onlineMembers.map((member) => (
                <div
                  key={member.uid}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 12px',
                    borderRadius: '12px',
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
                        fontSize: '14.5px',
                        fontWeight: 700,
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
                            fontSize: '10.5px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'rgba(255,255,255,0.1)',
                            color: 'var(--text-muted)'
                          }}
                        >
                          Guest
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {member.bio || 'JNU Scholar / Student'}
                    </div>
                  </div>

                  {currentUser && currentUser.uid !== member.uid && onStartCall && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onStartCall(member, 'voice');
                        }}
                        className="header-action-btn"
                        style={{ padding: '6px', borderRadius: '8px' }}
                        title={`Voice Call ${member.displayName}`}
                      >
                        <Phone size={15} color="#10b981" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onStartCall(member, 'video');
                        }}
                        className="header-action-btn"
                        style={{ padding: '6px', borderRadius: '8px' }}
                        title={`Video Call ${member.displayName}`}
                      >
                        <Video size={15} color="var(--accent-primary)" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
