import React from 'react';
import {
  X,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Video,
  Clock
} from 'lucide-react';
import { CallHistoryItem, ChatUser, CallType } from '../../types/chat.types';
import { Avatar } from '../common/Avatar';

interface CallHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  callHistory: CallHistoryItem[];
  onStartCall: (peer: ChatUser, type: CallType) => void;
}

export const CallHistoryModal: React.FC<CallHistoryModalProps> = ({
  isOpen,
  onClose,
  callHistory,
  onStartCall
}) => {
  if (!isOpen) return null;

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today, ${timeStr}`;

    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className="modal-overlay as-sheet" onClick={onClose} style={{ zIndex: 1000 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '460px', width: '100%' }}
      >
        {/* Mobile handle indicator */}
        <div
          style={{
            width: '40px',
            height: '4px',
            borderRadius: '2px',
            background: 'var(--border-color)',
            margin: '0 auto 16px auto'
          }}
        />

        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(99, 102, 241, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)'
              }}
            >
              <Clock size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Recent Calls
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Voice and video call log
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Calls List */}
        <div
          style={{
            maxHeight: '380px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          {callHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--text-muted)' }}>
              <Phone size={32} style={{ opacity: 0.4, marginBottom: '8px' }} />
              <p style={{ margin: 0, fontSize: '14px' }}>No recent call history</p>
            </div>
          ) : (
            callHistory.map((item) => {
              const isMissed = item.status === 'missed';
              const isIncoming = item.direction === 'incoming';
              const isVideo = item.callType === 'video';

              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <Avatar
                      src={item.peer.photoURL}
                      name={item.peer.displayName}
                      size="sm"
                    />

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: isMissed ? '#ef4444' : 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {item.peer.displayName}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          marginTop: '2px'
                        }}
                      >
                        {isMissed ? (
                          <PhoneMissed size={13} color="#ef4444" />
                        ) : isIncoming ? (
                          <PhoneIncoming size={13} color="#10b981" />
                        ) : (
                          <PhoneOutgoing size={13} color="var(--accent-primary)" />
                        )}

                        <span>
                          {isMissed
                            ? 'Missed call'
                            : formatDuration(item.durationSeconds) || (isVideo ? 'Video call' : 'Voice call')}
                        </span>
                        <span>·</span>
                        <span>{formatTimestamp(item.timestamp)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Return Call Action Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onStartCall(
                          {
                            uid: item.peer.uid,
                            displayName: item.peer.displayName,
                            photoURL: item.peer.photoURL,
                            status: 'offline'
                          },
                          'voice'
                        );
                      }}
                      className="header-action-btn"
                      style={{ padding: '6px', borderRadius: '8px' }}
                      title={`Voice Call ${item.peer.displayName}`}
                    >
                      <Phone size={16} color="#10b981" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onStartCall(
                          {
                            uid: item.peer.uid,
                            displayName: item.peer.displayName,
                            photoURL: item.peer.photoURL,
                            status: 'offline'
                          },
                          'video'
                        );
                      }}
                      className="header-action-btn"
                      style={{ padding: '6px', borderRadius: '8px' }}
                      title={`Video Call ${item.peer.displayName}`}
                    >
                      <Video size={16} color="var(--accent-primary)" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
