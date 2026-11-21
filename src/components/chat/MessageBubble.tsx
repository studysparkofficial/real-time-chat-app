import React, { useState } from 'react';
import {
  Clock,
  Check,
  CheckCheck,
  AlertCircle,
  RotateCcw,
  Reply,
  Smile,
  Trash2,
  FileText,
  Download
} from 'lucide-react';
import { ChatMessage, ChatUser } from '../../types/chat.types';
import { Avatar } from '../common/Avatar';
import { renderMarkdownToSafeHtml } from '../../services/sanitize';
import { formatBytes } from '../../services/s3Service';

interface MessageBubbleProps {
  message: ChatMessage;
  currentUser: ChatUser | null;
  onRetry?: (clientTempId: string) => void;
  onReply?: (message: ChatMessage) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onDelete?: (messageId: string) => void;
  onImageClick?: (url: string, fileName?: string) => void;
  onScrollToReply?: (replyId: string) => void;
  onCopySuccess?: (text: string) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '🔥', '😂', '🎉', '🚀', '🎓', '☕'];

function getSenderColor(name: string): string {
  const colors = [
    '#38bdf8', '#818cf8', '#c084fc', '#f472b6',
    '#fb7185', '#fb923c', '#facc15', '#4ade80', '#34d399', '#2dd4bf'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUser,
  onRetry,
  onReply,
  onReaction,
  onDelete,
  onImageClick,
  onScrollToReply,
  onCopySuccess
}) => {
  const [showToolbar, setShowToolbar] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const isOutgoing = currentUser ? message.sender.uid === currentUser.uid : false;
  const senderColor = getSenderColor(message.sender.displayName || 'Scholar');

  // Format time (e.g. 10:45 AM)
  const timeString = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  // Render delivery status icon for outgoing messages
  const renderStatus = () => {
    if (!isOutgoing) return null;

    if (message.status === 'sending') {
      return (
        <span title="Sending to JNUverse…" className="status-tick">
          <Clock size={14} />
        </span>
      );
    }
    if (message.status === 'sent') {
      return (
        <span title="Sent to Cloud" className="status-tick">
          <Check size={15} />
        </span>
      );
    }
    if (message.status === 'delivered') {
      return (
        <span title="Delivered & Synced" className="status-tick delivered">
          <CheckCheck size={16} />
        </span>
      );
    }
    if (message.status === 'failed') {
      return (
        <span title={message.errorMessage || 'Failed'} className="status-tick">
          <AlertCircle size={15} color="#ef4444" />
        </span>
      );
    }
    return null;
  };

  const handleBubbleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('markdown-code-copy-btn')) {
      const code = target.getAttribute('data-code');
      if (code && typeof navigator !== 'undefined') {
        navigator.clipboard.writeText(code);
        target.textContent = 'Copied!';
        if (onCopySuccess) onCopySuccess('Code copied to clipboard');
        setTimeout(() => {
          target.textContent = 'Copy';
        }, 2000);
      }
    }
  };

  const attachmentUrl = message.attachment?.url || message.attachment?.downloadUrl;
  const attachmentName = message.attachment?.fileName || message.attachment?.name || 'attachment';
  const attachmentSize = message.attachment?.fileSize || message.attachment?.size || 0;

  return (
    <div
      id={`msg-${message.id}`}
      className={`message-row ${isOutgoing ? 'outgoing' : 'incoming'}`}
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => {
        setShowToolbar(false);
        setShowReactionPicker(false);
      }}
      style={{ position: 'relative' }}
    >
      {/* Incoming avatar with status indicator */}
      {!isOutgoing && (
        <Avatar
          src={message.sender.photoURL}
          name={message.sender.displayName}
          size="sm"
          className="incoming-avatar"
        />
      )}

      {/* Bubble Container */}
      <div
        className={`message-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`}
        onClick={handleBubbleClick}
      >
        {/* Reply Quote Banner */}
        {message.replyTo && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (onScrollToReply) onScrollToReply(message.replyTo!.id);
            }}
            style={{
              padding: '6px 12px',
              marginBottom: '8px',
              borderRadius: '10px',
              background: isOutgoing ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.07)',
              borderLeft: '4px solid var(--accent-gold, #f59e0b)',
              cursor: 'pointer',
              fontSize: '13px',
              userSelect: 'none'
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--accent-gold, #f59e0b)', marginBottom: '2px' }}>
              {message.replyTo.senderName}
            </div>
            <div
              style={{
                color: isOutgoing ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {message.replyTo.text}
            </div>
          </div>
        )}

        {/* Sender Name for incoming messages */}
        {!isOutgoing && (
          <div className="bubble-sender" style={{ color: senderColor }}>
            {message.sender.displayName}
            {message.sender.isAnonymous && (
              <span
                style={{
                  fontSize: '10.5px',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.12)',
                  color: 'var(--text-muted)'
                }}
              >
                Guest Scholar
              </span>
            )}
          </div>
        )}

        {/* Media Attachment Rendering */}
        {message.attachment && (
          <div style={{ marginBottom: message.text ? '10px' : '0' }}>
            {message.attachment.category === 'image' && attachmentUrl && (
              <div
                style={{
                  borderRadius: '12px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  maxHeight: '380px'
                }}
                onClick={() => {
                  if (onImageClick && attachmentUrl) {
                    onImageClick(attachmentUrl, attachmentName);
                  }
                }}
              >
                <img
                  src={attachmentUrl}
                  alt={attachmentName}
                  loading="lazy"
                  style={{
                    display: 'block',
                    width: '100%',
                    maxHeight: '360px',
                    objectFit: 'cover',
                    borderRadius: '10px'
                  }}
                />
              </div>
            )}

            {message.attachment.category === 'video' && attachmentUrl && (
              <div style={{ borderRadius: '12px', overflow: 'hidden' }}>
                <video
                  src={attachmentUrl}
                  controls
                  preload="metadata"
                  style={{ maxWidth: '100%', maxHeight: '340px', borderRadius: '10px' }}
                />
              </div>
            )}

            {message.attachment.category === 'audio' && attachmentUrl && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: 'rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <audio
                  src={attachmentUrl}
                  controls
                  style={{ height: '40px', maxWidth: '260px' }}
                />
              </div>
            )}

            {message.attachment.category === 'pdf' && (
              <a
                href={attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={attachmentName}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  background: 'rgba(0,0,0,0.25)',
                  textDecoration: 'none',
                  color: 'inherit'
                }}
              >
                <div
                  style={{
                    padding: '10px',
                    borderRadius: '10px',
                    background: '#ef4444',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <FileText size={22} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {attachmentName}
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>
                    {formatBytes(attachmentSize)}
                  </div>
                </div>
                <Download size={20} style={{ opacity: 0.9 }} />
              </a>
            )}
          </div>
        )}

        {/* Message Text with DOMPurify XSS Sanitization & Markdown */}
        {message.text && (
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{
              __html: renderMarkdownToSafeHtml(message.text)
            }}
          />
        )}

        {/* Failed send alert with 1-tap Retry */}
        {message.status === 'failed' && (
          <div
            style={{
              marginTop: '8px',
              padding: '6px 10px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              fontSize: '13px',
              color: '#fca5a5'
            }}
          >
            <span>Delivery failed</span>
            {message.clientTempId && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(message.clientTempId!)}
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 700
                }}
              >
                <RotateCcw size={13} /> Retry
              </button>
            )}
          </div>
        )}

        {/* Bubble Meta (Timestamp & Status Checkmarks) */}
        <div className="bubble-meta">
          <span>{timeString}</span>
          {renderStatus()}
        </div>

        {/* Interactive Emoji Reactions */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              marginTop: '8px'
            }}
          >
            {Object.entries(message.reactions).map(([emoji, uids]) => {
              if (uids.length === 0) return null;
              const hasReacted = currentUser ? uids.includes(currentUser.uid) : false;

              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReaction && onReaction(message.id, emoji)}
                  title={`${uids.length} reaction${uids.length > 1 ? 's' : ''}`}
                  style={{
                    background: hasReacted
                      ? 'rgba(37, 99, 235, 0.4)'
                      : 'rgba(0, 0, 0, 0.28)',
                    border: hasReacted
                      ? '1px solid #3b82f6'
                      : '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '14px',
                    padding: '3px 8px',
                    fontSize: '13.5px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    color: '#fff',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <span>{emoji}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>{uids.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Hover Action Toolbar */}
      {showToolbar && message.status !== 'failed' && (
        <div
          style={{
            position: 'absolute',
            top: '-24px',
            [isOutgoing ? 'right' : 'left']: '48px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '24px',
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: 'var(--shadow-md)',
            zIndex: 10,
            animation: 'fadeIn 0.15s ease'
          }}
        >
          <button
            type="button"
            onClick={() => setShowReactionPicker(!showReactionPicker)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Add Reaction"
          >
            <Smile size={18} />
          </button>

          {onReply && (
            <button
              type="button"
              onClick={() => onReply(message)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Reply"
            >
              <Reply size={18} />
            </button>
          )}

          {isOutgoing && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(message.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ef4444',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Delete message"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}

      {/* Quick Reaction Emoji Picker Popover */}
      {showReactionPicker && (
        <div
          style={{
            position: 'absolute',
            top: '-58px',
            [isOutgoing ? 'right' : 'left']: '48px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '26px',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: 'var(--shadow-xl)',
            zIndex: 11,
            animation: 'scaleUp 0.15s ease'
          }}
        >
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                if (onReaction) onReaction(message.id, emoji);
                setShowReactionPicker(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '8px',
                transition: 'transform 0.1s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.25)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
