import React, { useEffect } from 'react';
import { WifiOff, Radio } from 'lucide-react';
import { Header } from './Header';
import { MobileDrawerBackdrop } from './MobileDrawerBackdrop';
import { ChannelsSidebar } from '../sidebar/ChannelsSidebar';
import { VirtualizedMessageList } from '../chat/VirtualizedMessageList';
import { ChatInputBar } from '../chat/ChatInputBar';
import { TypingIndicator } from '../chat/TypingIndicator';
import { ToastContainer, ToastMessage } from '../common/Toast';
import { ErrorBoundary } from '../common/ErrorBoundary';
import {
  ChatRoom,
  ChatUser,
  ChatMessage,
  MessageReplyReference,
  UserPreferences
} from '../../types/chat.types';

interface AppLayoutProps {
  rooms: ChatRoom[];
  activeRoom: ChatRoom;
  onSelectRoom: (roomId: string) => void;
  currentUser: ChatUser | null;
  preferences: UserPreferences;
  onToggleTheme: () => void;
  onlineCount: number;
  isOnline: boolean;
  messages: ChatMessage[];
  initialLoading: boolean;
  typingUsers: { uid: string; displayName: string; timestamp: number }[];
  onSendMessage: (text: string, file?: File | null) => Promise<void>;
  onTyping: () => void;
  replyTo: MessageReplyReference | null;
  onSetReplyTo: (ref: MessageReplyReference | null) => void;
  stagedFile: File | null;
  stagedPreview: string | null;
  uploadProgress: number;
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
  onRetryMessage: (clientTempId: string) => void;
  onReaction: (messageId: string, emoji: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onImageClick: (url: string, fileName?: string) => void;
  onOpenCreateChannel: () => void;
  onOpenAccountModal: () => void;
  onOpenAuthModal: () => void;
  onOpenChannelInfo: () => void;
  isSidebarOpenMobile: boolean;
  setIsSidebarOpenMobile: (open: boolean) => void;
  toasts: ToastMessage[];
  onDismissToast: (id: string) => void;
  unreadCounts: Record<string, number>;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  rooms,
  activeRoom,
  onSelectRoom,
  currentUser,
  preferences,
  onToggleTheme,
  onlineCount,
  isOnline,
  messages,
  initialLoading,
  typingUsers,
  onSendMessage,
  onTyping,
  replyTo,
  onSetReplyTo,
  stagedFile,
  stagedPreview,
  uploadProgress,
  isUploading,
  uploadError,
  isRecording,
  recordingSeconds,
  onStageFile,
  onClearStagedFile,
  onClipboardPaste,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  onRetryMessage,
  onReaction,
  onDeleteMessage,
  onImageClick,
  onOpenCreateChannel,
  onOpenAccountModal,
  onOpenAuthModal,
  onOpenChannelInfo,
  isSidebarOpenMobile,
  setIsSidebarOpenMobile,
  toasts,
  onDismissToast,
  unreadCounts
}) => {
  return (
    <div className="pulse-app">
      {/* Offline Status Top Banner */}
      {!isOnline && (
        <div className="offline-banner">
          <div className="offline-pulse-dot" />
          <WifiOff size={16} />
          <span>Connecting to PulseChat… Outgoing messages are queued safely in IndexedDB</span>
        </div>
      )}

      {/* Mobile Off-canvas Drawer Backdrop */}
      <MobileDrawerBackdrop
        isOpen={isSidebarOpenMobile}
        onClose={() => setIsSidebarOpenMobile(false)}
      />

      {/* Channels Sidebar (Fixed Desktop 260px / Mobile Off-Canvas Drawer) */}
      <ChannelsSidebar
        rooms={rooms}
        activeRoomId={activeRoom.id}
        onSelectRoom={onSelectRoom}
        currentUser={currentUser}
        unreadCounts={unreadCounts}
        onOpenCreateChannel={onOpenCreateChannel}
        onOpenAccountModal={onOpenAccountModal}
        onOpenAuthModal={onOpenAuthModal}
        isOpenMobile={isSidebarOpenMobile}
        onCloseMobile={() => setIsSidebarOpenMobile(false)}
      />

      {/* Main Chat Area */}
      <main className="chat-main">
        {/* Chat Header */}
        <Header
          currentRoom={activeRoom}
          onlineCount={onlineCount}
          currentUser={currentUser}
          theme={preferences.theme}
          onToggleTheme={onToggleTheme}
          onToggleSidebar={() => setIsSidebarOpenMobile(!isSidebarOpenMobile)}
          onOpenChannelInfo={onOpenChannelInfo}
          onOpenAccountModal={onOpenAccountModal}
        />

        {/* Message Stream with Virtualization & Error Boundary */}
        <ErrorBoundary fallbackMessage="Unable to render message stream">
          <VirtualizedMessageList
            messages={messages}
            currentUser={currentUser}
            initialLoading={initialLoading}
            onRetry={onRetryMessage}
            onReply={(msg) =>
              onSetReplyTo({
                id: msg.id,
                text: msg.text || (msg.attachment ? `[${msg.attachment.category}]` : ''),
                senderName: msg.sender.displayName
              })
            }
            onReaction={onReaction}
            onDelete={onDeleteMessage}
            onImageClick={onImageClick}
            onCopySuccess={(txt) => onDismissToast(txt)}
          />
        </ErrorBoundary>

        {/* Room Typing Indicator */}
        <TypingIndicator typingUsers={typingUsers} />

        {/* WhatsApp-Style Pill Input Bar */}
        <ChatInputBar
          onSendMessage={async (txt, file) => {
            await onSendMessage(txt, file);
            onSetReplyTo(null);
          }}
          onTyping={onTyping}
          replyTo={replyTo}
          onCancelReply={() => onSetReplyTo(null)}
          stagedFile={stagedFile}
          stagedPreview={stagedPreview}
          uploadProgress={uploadProgress}
          isUploading={isUploading}
          uploadError={uploadError}
          isRecording={isRecording}
          recordingSeconds={recordingSeconds}
          onStageFile={onStageFile}
          onClearStagedFile={onClearStagedFile}
          onClipboardPaste={onClipboardPaste}
          onStartRecording={onStartRecording}
          onStopRecording={onStopRecording}
          onCancelRecording={onCancelRecording}
        />
      </main>

      {/* Global Toast Alerts */}
      <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
    </div>
  );
};
