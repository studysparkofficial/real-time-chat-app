import React, { useState, useRef, useEffect } from 'react';
import {
  Smile,
  Paperclip,
  Code,
  Mic,
  Send,
  X,
  StopCircle,
  Trash2,
  Image as ImageIcon
} from 'lucide-react';
import { ChatUser, MessageReplyReference } from '../../types/chat.types';
import { formatBytes } from '../../services/s3Service';

interface ChatInputBarProps {
  onSendMessage: (text: string, file?: File | null, mentions?: string[]) => Promise<void>;
  mentionUsers?: ChatUser[];
  placeholder?: string;
  onTyping: () => void;
  replyTo: MessageReplyReference | null;
  onCancelReply: () => void;
  stagedFile: File | null;
  stagedPreview: string | null;
  isUploading: boolean;
  uploadError: string | null;
  isRecording: boolean;
  recordingSeconds: number;
  onStageFile: (file: File) => boolean;
  onClearStagedFile: () => void;
  onClipboardPaste: (e: React.ClipboardEvent) => void;
  onStartRecording: () => void;
  onStopRecording: () => Promise<File | null>;
  onCancelRecording: () => void;
}

const COMMON_EMOJIS = ['🎓', '☕', '📚', '🏛️', '🔥', '👍', '❤️', '🎉', '🚀', '✨', '👀', '💯'];

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  onSendMessage,
  mentionUsers = [],
  placeholder = 'Message #JNUverse… (paste photos or press Enter)',
  onTyping,
  replyTo,
  onCancelReply,
  stagedFile,
  stagedPreview,
  isUploading,
  uploadError,
  isRecording,
  recordingSeconds,
  onStageFile,
  onClearStagedFile,
  onClipboardPaste,
  onStartRecording,
  onStopRecording,
  onCancelRecording
}) => {
  const [text, setText] = useState('');
  const [showEmojiTray, setShowEmojiTray] = useState(false);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<{ start: number; query: string; cursor: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-resize textarea as user types up to 130px
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 130)}px`;
    }
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart;
    setText(value);
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/(^|\s)@([^\s@]{0,40})$/u);
    setMentionQuery(match
      ? { start: cursor - match[2].length - 1, query: match[2].toLocaleLowerCase(), cursor }
      : null);
    onTyping();
  };

  const mentionCandidates = mentionQuery
    ? mentionUsers
      .filter((user) => user.displayName.toLocaleLowerCase().startsWith(mentionQuery.query))
      .slice(0, 5)
    : [];

  const selectMention = (user: ChatUser) => {
    if (!mentionQuery) return;
    const before = text.slice(0, mentionQuery.start);
    const after = text.slice(mentionQuery.cursor);
    const insertion = `@${user.displayName} `;
    const nextText = `${before}${insertion}${after}`;
    const nextCursor = before.length + insertion.length;
    setText(nextText);
    setMentionQuery(null);
    setMentionIds((previous) => previous.includes(user.uid) ? previous : [...previous, user.uid]);
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleFocus = () => {
    // Prevent mobile keyboard from shifting, scrolling or zooming window out of frame
    window.scrollTo(0, 0);
    if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
    setTimeout(() => {
      window.scrollTo(0, 0);
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
    }, 50);
    setTimeout(() => {
      window.scrollTo(0, 0);
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
    }, 250);
  };

  const handleSend = async () => {
    if (!text.trim() && !stagedFile) return;
    const currentText = text;
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setShowEmojiTray(false);
    setMentionQuery(null);
    const activeMentions = mentionUsers
      .filter((user) => mentionIds.includes(user.uid) && currentText.includes(`@${user.displayName}`))
      .map((user) => user.uid);
    await onSendMessage(currentText, stagedFile, activeMentions);
    setMentionIds([]);
  };

  const handleCodeBlock = () => {
    if (text.includes('```')) {
      setText((prev) => prev.replace(/```/g, ''));
    } else {
      setText((prev) => `\`\`\`javascript\n${prev}\n\`\`\``);
    }
    textareaRef.current?.focus({ preventScroll: true });
  };

  const handleEmojiSelect = (emoji: string) => {
    setText((prev) => prev + emoji);
    textareaRef.current?.focus({ preventScroll: true });
  };

  const formatRecordingTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        width: '100%',
        minWidth: 0,
        flexShrink: 0,
        zIndex: 25
      }}
    >
      {/* Quick Emoji Tray Popover */}
      {showEmojiTray && (
        <div
          className="emoji-tray-popover"
          style={{
            margin: '0 16px 8px 16px',
            padding: '10px 16px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
            boxShadow: 'var(--shadow-lg)',
            animation: 'fadeIn 0.15s ease'
          }}
        >
          {COMMON_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleEmojiSelect(emoji)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px'
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Reply Banner Above Input */}
      {replyTo && (
        <div
          className="reply-banner-bar"
          style={{
            margin: '0 16px 8px 16px',
            padding: '10px 14px',
            background: 'var(--bg-secondary)',
            borderLeft: '4px solid var(--accent-gold, #f59e0b)',
            borderTop: '1px solid var(--border-color)',
            borderRight: '1px solid var(--border-color)',
            borderBottom: '1px solid var(--border-color)',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            animation: 'slideUp 0.15s ease'
          }}
        >
          <div style={{ minWidth: 0, flex: 1, fontSize: '14px' }}>
            <span style={{ fontWeight: 700, color: 'var(--accent-gold, #f59e0b)', marginRight: '6px' }}>
              Replying to {replyTo.senderName}:
            </span>
            <span
              style={{
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {replyTo.text}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Staged File / Photo Preview Banner */}
      {stagedFile && (
        <div
          className="staged-file-banner"
          style={{
            margin: '0 16px 10px 16px',
            padding: '10px 14px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            boxShadow: 'var(--shadow-md)'
          }}
        >
          {stagedPreview ? (
            <img
              src={stagedPreview}
              alt="Preview"
              style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '10px' }}
            />
          ) : (
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '10px',
                background: 'var(--bg-card-hover)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)'
              }}
            >
              <ImageIcon size={26} />
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: '14.5px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {stagedFile.name}
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              {formatBytes(stagedFile.size)}
            </div>

          </div>

          <button
            type="button"
            onClick={onClearStagedFile}
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
      )}

      {/* Upload Error Banner */}
      {uploadError && (
        <div
          className="upload-error-banner"
          style={{
            margin: '0 16px 8px 16px',
            padding: '8px 14px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '12px',
            color: '#f87171',
            fontSize: '13.5px'
          }}
        >
          {uploadError}
        </div>
      )}

      {mentionQuery && mentionCandidates.length > 0 && (
        <div className="mention-suggestions" role="listbox" aria-label="Mention a user">
          {mentionCandidates.map((user) => (
            <button key={user.uid} type="button" role="option" onClick={() => selectMention(user)}>
              <span className="mention-avatar">{user.displayName.slice(0, 1).toLocaleUpperCase()}</span>
              <span>{user.displayName}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Input Pill Bar Container */}
      <div className="input-bar-container">
        {/* Voice Note Recording State vs Normal Input Pill */}
        {isRecording ? (
          <div
            className="input-pill-wrapper"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              borderColor: 'rgba(239, 68, 68, 0.4)',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: '#ef4444',
                  animation: 'pulseBlink 1s infinite'
                }}
              />
              <span style={{ fontWeight: 700, color: '#ef4444', fontSize: '15px' }}>
                Recording Audio Note
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 600 }}>
                {formatRecordingTime(recordingSeconds)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={onCancelRecording}
                className="pill-icon-btn"
                title="Cancel Recording"
                style={{ color: '#ef4444' }}
              >
                <Trash2 size={22} />
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onStopRecording();
                }}
                className="pill-icon-btn"
                title="Finish Recording"
                style={{ color: 'var(--success-color)' }}
              >
                <StopCircle size={26} />
              </button>
            </div>
          </div>
        ) : (
          <div className="input-pill-wrapper">
            {/* Emoji Trigger */}
            <button
              type="button"
              onClick={() => setShowEmojiTray(!showEmojiTray)}
              className="pill-icon-btn"
              title="Emoji"
              aria-label="Insert Emoji"
            >
              <Smile size={23} />
            </button>

            {/* Hidden native file input for photos, camera & documents */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onStageFile(e.target.files[0]);
                  e.target.value = '';
                }
              }}
            />

            {/* Attachment Tool */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="pill-icon-btn"
              title="Send Photo, Video or PDF"
              aria-label="Send Photo, Video or PDF"
            >
              <Paperclip size={23} />
            </button>

            {/* Code Snippet Editor Trigger */}
            <button
              type="button"
              onClick={handleCodeBlock}
              className="pill-icon-btn pill-btn-code"
              title="Insert Code Snippet"
              aria-label="Insert Code Snippet"
            >
              <Code size={22} />
            </button>

            {/* Auto-growing Textarea (16px font to prevent mobile zoom) */}
            <textarea
              ref={textareaRef}
              className="pill-textarea"
              placeholder={placeholder}
              rows={1}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={onClipboardPaste}
              onFocus={handleFocus}
              style={{
                fontSize: '16px',
                WebkitTextSizeAdjust: '100%',
                touchAction: 'manipulation'
              }}
            />

            {/* Mic voice note recording trigger (shown when no text) */}
            {!text.trim() && !stagedFile && (
              <button
                type="button"
                onClick={onStartRecording}
                className="pill-icon-btn"
                title="Record Voice Note"
                aria-label="Record Voice Note"
              >
                <Mic size={23} />
              </button>
            )}
          </div>
        )}

        {/* Circular Gradient Send Action */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() && !stagedFile}
          className="send-round-btn"
          title={isUploading ? 'Send to JNUverse (file uploads continue in the background)' : 'Send to JNUverse'}
          aria-label="Send Message"
        >
          <Send size={22} style={{ marginLeft: '2px' }} />
        </button>
      </div>
    </div>
  );
};
