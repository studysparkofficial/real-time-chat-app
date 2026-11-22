import React from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
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
  isDesktopSidebarOpen: boolean;
  setIsDesktopSidebarOpen: (open: boolean) => void;
  toasts: ToastMessage[];
  onDismissToast: (id: string) => void;
  unreadCounts: Record<string, number>;
  canInstallApp: boolean;
  onInstallApp: () => Promise<void>;
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
  isDesktopSidebarOpen,
  setIsDesktopSidebarOpen,
  toasts,
  onDismissToast,
  unreadCounts,
  canInstallApp,
  onInstallApp
}) => {
  const handleToggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setIsSidebarOpenMobile(!isSidebarOpenMobile);
    } else {
      setIsDesktopSidebarOpen(!isDesktopSidebarOpen);
    }
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpenMobile(false);
    setIsDesktopSidebarOpen(false);
  };

  return (
    <div className="pulse-app">
      {/* Offline Status Top Banner */}
      {!isOnline && (
        <div className="offline-banner">
          <div className="offline-pulse-dot" />
          <WifiOff size={18} />
          <span>Connecting to JNUverse… Outbox queued locally</span>
        </div>
      )}

      {/* Mobile Off-canvas Drawer Backdrop */}
      <MobileDrawerBackdrop
        isOpen={isSidebarOpenMobile}
        onClose={() => setIsSidebarOpenMobile(false)}
      />

      {/* Channels Sidebar: Works seamlessly on both Desktop & Mobile */}
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
        isDesktopOpen={isDesktopSidebarOpen}
        onCloseSidebar={handleCloseSidebar}
      />

      {/* Main Chat Area */}
      <main className="chat-main">
        {/* JNUverse Header */}
        <Header
          currentRoom={activeRoom}
          onlineCount={onlineCount}
          currentUser={currentUser}
          theme={preferences.theme}
          onToggleTheme={onToggleTheme}
          onToggleSidebar={handleToggleSidebar}
          onOpenChannelInfo={onOpenChannelInfo}
          onOpenAccountModal={onOpenAccountModal}
        />

        {canInstallApp && (
          <div className="pwa-install-banner">
            <div className="pwa-install-copy">
              <Smartphone size={18} aria-hidden="true" />
              <span>Add JNUverse to your home screen</span>
            </div>
            <button
              type="button"
              className="pwa-install-button"
              onClick={() => void onInstallApp()}
              aria-label="Install JNUverse App"
            >
              <Download size={16} aria-hidden="true" />
              <span>Install JNUverse App</span>
            </button>
          </div>
        )}

        {/* Virtualized Message Stream with Error Boundary */}
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
