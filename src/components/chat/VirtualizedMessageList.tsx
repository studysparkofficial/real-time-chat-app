import React, { useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChatMessage, ChatUser } from '../../types/chat.types';
import { MessageBubble } from './MessageBubble';
import { Skeleton } from '../common/Skeleton';

interface VirtualizedMessageListProps {
  messages: ChatMessage[];
  currentUser: ChatUser | null;
  initialLoading: boolean;
  jumpToMessageId?: string | null;
  onJumpMessageComplete?: () => void;
  onRetry: (clientTempId: string) => void;
  onReply: (message: ChatMessage) => void;
  onReaction: (messageId: string, emoji: string) => void;
  onDelete: (messageId: string) => void;
  onImageClick: (url: string, fileName?: string) => void;
  onCopySuccess: (text: string) => void;
}

export const VirtualizedMessageList: React.FC<VirtualizedMessageListProps> = ({
  messages,
  currentUser,
  initialLoading,
  jumpToMessageId,
  onJumpMessageComplete,
  onRetry,
  onReply,
  onReaction,
  onDelete,
  onImageClick,
  onCopySuccess
}) => {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef<boolean>(true);

  // Virtualizer for handling up to 10,000+ messages smoothly
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 86,
    overscan: 6
  });
  const rowVirtualizerRef = useRef(rowVirtualizer);
  rowVirtualizerRef.current = rowVirtualizer;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Track if user is near bottom of scroll container
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    // User is within 150px of bottom
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 150;
  }, []);

  // Auto-scroll to bottom on new messages if already near bottom
  useEffect(() => {
    if (messages.length > 0 && isNearBottomRef.current) {
      rowVirtualizerRef.current.scrollToIndex(messages.length - 1, { align: 'end' });
    }
  }, [messages.length]);

  useEffect(() => {
    if (!jumpToMessageId || initialLoading) return;
    const targetIndex = messagesRef.current.findIndex((message) => message.id === jumpToMessageId);
    if (targetIndex < 0) return;
    rowVirtualizerRef.current.scrollToIndex(targetIndex, { align: 'center', behavior: 'smooth' });
    const timer = window.setTimeout(() => {
      const element = document.getElementById(`msg-${jumpToMessageId}`);
      if (element) {
        element.style.transition = 'background-color 0.4s ease';
        element.style.backgroundColor = 'rgba(59, 130, 246, 0.18)';
        window.setTimeout(() => { element.style.backgroundColor = 'transparent'; }, 1300);
      }
      onJumpMessageComplete?.();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [jumpToMessageId, initialLoading, messages.length, onJumpMessageComplete]);

  useEffect(() => {
    const element = parentRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (messagesRef.current.length > 0 && isNearBottomRef.current) {
        rowVirtualizerRef.current.scrollToIndex(messagesRef.current.length - 1, { align: 'end' });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [messages.length > 0]);

  // Jump to reply quote message with smooth animation
  const handleScrollToReply = useCallback((replyId: string) => {
    const targetIndex = messagesRef.current.findIndex((m) => m.id === replyId);
    if (targetIndex !== -1) {
      rowVirtualizerRef.current.scrollToIndex(targetIndex, { align: 'center', behavior: 'smooth' });
      // Briefly flash highlighted message
      setTimeout(() => {
        const el = document.getElementById(`msg-${replyId}`);
        if (el) {
          el.style.transition = 'background-color 0.4s ease';
          el.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
          setTimeout(() => {
            el.style.backgroundColor = 'transparent';
          }, 1200);
        }
      }, 100);
    }
  }, []);

  if (initialLoading && messages.length === 0) {
    return (
      <div className="messages-viewport" style={{ gap: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <Skeleton width={36} height={36} borderRadius="50%" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Skeleton width={120} height={14} />
            <Skeleton width="min(240px, 60vw)" height={40} borderRadius={16} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Skeleton width="min(200px, 55vw)" height={42} borderRadius={16} />
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <Skeleton width={36} height={36} borderRadius="50%" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Skeleton width={90} height={14} />
            <Skeleton width="min(260px, 65vw)" height={56} borderRadius={16} />
          </div>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div
        className="messages-viewport"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          color: 'var(--text-muted)'
        }}
      >
        <div style={{ maxWidth: '320px', padding: '24px' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>💬</div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Welcome to the Channel
          </h3>
          <p style={{ fontSize: '13px' }}>
            No messages yet. Start the conversation by saying hello or sharing an image!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="messages-viewport"
      onScroll={handleScroll}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const message = messages[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              <MessageBubble
                message={message}
                currentUser={currentUser}
                onRetry={onRetry}
                onReply={onReply}
                onReaction={onReaction}
                onDelete={onDelete}
                onImageClick={onImageClick}
                onScrollToReply={handleScrollToReply}
                onCopySuccess={onCopySuccess}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
