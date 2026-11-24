import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { AuthModal } from './components/modals/AuthModal';
import { AccountModal } from './components/modals/AccountModal';
import { ChannelInfoModal } from './components/modals/ChannelInfoModal';
import { CreateChannelModal } from './components/modals/CreateChannelModal';
import { LightboxModal } from './components/modals/LightboxModal';
import { PwaInstallModal } from './components/modals/PwaInstallModal';
import { NewDirectMessageModal } from './components/modals/NewDirectMessageModal';
import { ToastMessage } from './components/common/Toast';
import { IncomingCallModal } from './components/calling/IncomingCallModal';
import { OutgoingCallModal } from './components/calling/OutgoingCallModal';
import { CallWindow } from './components/calling/CallWindow';
import { CallHistoryModal } from './components/calling/CallHistoryModal';
import { NotificationCenter } from './components/notifications/NotificationCenter';

import { useAuth } from './hooks/useAuth';
import { usePresence } from './hooks/usePresence';
import { useMessages } from './hooks/useMessages';
import { useAttachments } from './hooks/useAttachments';
import { useAudio } from './hooks/useAudio';
import { useHaptics } from './hooks/useHaptics';
import { usePwaInstall } from './hooks/usePwaInstall';
import { useDirectMessages } from './hooks/useDirectMessages';
import { useCalling } from './hooks/useCalling';
import { useNotifications } from './hooks/useNotifications';

import { db, collection, addDoc, onSnapshot } from './services/firebase';
import { localCache } from './services/indexedDbCache';
import { validateAttachment } from './services/s3Service';
import { AppNotification, ChatRoom, ChatUser, DirectConversation, MessageAttachment, MessageReplyReference } from './types/chat.types';
import { isDirectConversationId } from './services/directMessages';

// Official JNU Campus Channels
const JNU_DEFAULT_ROOMS: ChatRoom[] = [
  {
    id: 'campus-central',
    name: 'campus-central',
    slug: 'campus-central',
    icon: '🏛️',
    topic: 'Official JNU announcements, academic schedules, administrative circulars, and university news.'
  },
  {
    id: 'ganga-dhaba',
    name: 'ganga-dhaba',
    slug: 'ganga-dhaba',
    icon: '☕',
    topic: 'Late-night chai charcha, student council discussions, debates, philosophy, and gatherings.'
  },
  {
    id: 'hostels-mess',
    name: 'hostels-mess',
    slug: 'hostels-mess',
    icon: '🛏️',
    topic: 'Ganga, Yamuna, Jhelum, Sutlej, Mahi-Mandavi, Kaveri, Periyar, Tapti hostel & mess queries.'
  },
  {
    id: 'library-research',
    name: 'library-research',
    slug: 'library-research',
    icon: '📚',
    topic: 'Dr. B.R. Ambedkar Central Library seating, research methodology, MPhil/PhD thesis discussions.'
  },
  {
    id: 'school-academics',
    name: 'school-academics',
    slug: 'school-academics',
    icon: '🎓',
    topic: 'SIS, SL, SSS, SPS, SES, SBT, SC&IS department seminars, assignments, and study materials.'
  },
  {
    id: 'lost-and-found',
    name: 'lost-and-found',
    slug: 'lost-and-found',
    icon: '🔍',
    topic: 'Lost identity cards, hostel keys, books, electronics, and documents across campus.'
  },
  {
    id: 'cultural-sports',
    name: 'cultural-sports',
    slug: 'cultural-sports',
    icon: '🎭',
    topic: 'PSR (Parthasarathy Rocks) evening jams, theatrical plays, sports stadium events, and fests.'
  }
];

function wasInstallOnboardingDismissed(userId: string): boolean {
  try {
    return sessionStorage.getItem(`jnuverse-install-dismissed:${userId}`) === 'true';
  } catch {
    return false;
  }
}

function rememberInstallOnboardingDismissal(userId: string): void {
  try {
    sessionStorage.setItem(`jnuverse-install-dismissed:${userId}`, 'true');
  } catch {
    // The dialog can still be dismissed for the current render if storage is disabled.
  }
}

export const App: React.FC = () => {
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();

  // 1. Auth & Preferences
  const {
    user: currentUser,
    loading: authLoading,
    preferences,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    loginAsGuest,
    logout,
    updateUserProfile,
    updatePreferences
  } = useAuth();

  const notificationState = useNotifications(currentUser);

  // 2. Audio & Haptics
  const { playSent, playReceived, playReaction } = useAudio(preferences.soundEnabled && notificationState.settings.sounds);
  const { lightTap } = useHaptics(preferences.hapticsEnabled);

  // 3. Channels State
  const [rooms, setRooms] = useState<ChatRoom[]>(JNU_DEFAULT_ROOMS);
  const [activeRoomId, setActiveRoomId] = useState<string>('campus-central');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [activeDirectConversationId, setActiveDirectConversationId] = useState<string | null>(null);
  const [activeDirectPeer, setActiveDirectPeer] = useState<ChatUser | null>(null);
  const [pendingNotificationRoute, setPendingNotificationRoute] = useState<{ roomId?: string; messageId?: string; callId?: string } | null>(null);
  const [notificationMessageId, setNotificationMessageId] = useState<string | null>(null);

  // 4. Modals and Overlays State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [channelInfoModalOpen, setChannelInfoModalOpen] = useState(false);
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [newDirectMessageModalOpen, setNewDirectMessageModalOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxName, setLightboxName] = useState<string | undefined>(undefined);
  const [installOnboardingOpen, setInstallOnboardingOpen] = useState(false);
  const [callHistoryModalOpen, setCallHistoryModalOpen] = useState(false);
  const localPreviewUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => () => {
    localPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localPreviewUrlsRef.current.clear();
  }, []);

  // Keep the chat shell fitted to the visible viewport while the mobile keyboard
  // is open, without unwanted page zooming or horizontal/vertical shifting.
  useEffect(() => {
    const root = document.documentElement;
    const visualViewport = window.visualViewport;
    const updateViewportHeight = () => {
      let height = window.innerHeight;
      if (visualViewport) {
        // When Android soft keyboard opens, visualViewport.scale may become > 1 if auto-zoomed.
        // Multiplying by scale restores the unscaled physical layout height and cancels distortion.
        height = visualViewport.scale > 1.01
          ? visualViewport.height * visualViewport.scale
          : visualViewport.height;
      }
      root.style.setProperty('--app-viewport-height', `${Math.round(height)}px`);
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
      if (document.body.scrollTop !== 0) {
        document.body.scrollTop = 0;
      }
    };

    updateViewportHeight();
    visualViewport?.addEventListener('resize', updateViewportHeight);
    visualViewport?.addEventListener('scroll', updateViewportHeight);
    window.addEventListener('resize', updateViewportHeight);
    window.addEventListener('orientationchange', updateViewportHeight);

    // Prevent multi-touch pinch to zoom from scaling the chat layout
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      visualViewport?.removeEventListener('resize', updateViewportHeight);
      visualViewport?.removeEventListener('scroll', updateViewportHeight);
      window.removeEventListener('resize', updateViewportHeight);
      window.removeEventListener('orientationchange', updateViewportHeight);
      document.removeEventListener('touchmove', handleTouchMove);
      root.style.removeProperty('--app-viewport-height');
    };
  }, []);

  // Automatically prompt new / unauthenticated visitors with the Authentication Modal
  useEffect(() => {
    if (!authLoading && !currentUser) {
      setAuthModalOpen(true);
    }
  }, [authLoading, currentUser]);

  // Show install onboarding once per signed-in session until the app is
  // installed. Browsers without a native prompt get platform-specific steps.
  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || isInstalled) {
      setInstallOnboardingOpen(false);
      return;
    }

    setAuthModalOpen(false);
    setInstallOnboardingOpen(!wasInstallOnboardingDismissed(currentUser.uid));
  }, [authLoading, currentUser?.uid, isInstalled]);

  // Sidebar Open States: Mobile Drawer + Desktop Collapsible
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);

  // 5. Reply Reference State
  const [replyTo, setReplyTo] = useState<MessageReplyReference | null>(null);

  // 6. Toasts State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Amazon Chime SDK Audio & Video Calling Hook
  const {
    activeCall,
    incomingCall,
    meetingCredentials,
    callHistory,
    startCall,
    acceptCall,
    rejectCall,
    endCall
  } = useCalling(currentUser, addToast);

  const handleStartVoiceCall = useCallback(
    (peer: ChatUser) => {
      void startCall(peer, 'voice');
    },
    [startCall]
  );

  const handleStartVideoCall = useCallback(
    (peer: ChatUser) => {
      void startCall(peer, 'video');
    },
    [startCall]
  );

  // Sync custom channels from Firestore & cache in IndexedDB.
  // Wait for auth — an early listener is rejected and does not reconnect.
  useEffect(() => {
    if (!currentUser?.uid) return;

    localCache.getCachedRooms().then((cached) => {
      if (cached && cached.length > 0) {
        setRooms(cached);
      }
    });

    const col = collection(db, 'custom_rooms');
    const unsub = onSnapshot(
      col,
      (snapshot) => {
        const custom: ChatRoom[] = [];
        snapshot.forEach((d) => {
          custom.push(d.data() as ChatRoom);
        });

        const mergedMap = new Map<string, ChatRoom>();
        JNU_DEFAULT_ROOMS.forEach((r) => mergedMap.set(r.id, r));
        custom.forEach((r) => mergedMap.set(r.id, r));

        const fullList = Array.from(mergedMap.values());
        setRooms(fullList);
        localCache.cacheRooms(fullList);
      },
      (err) => {
        console.warn('[Channels] Snapshot error:', err);
      }
    );

    return () => unsub();
  }, [currentUser?.uid]);

  // Active Room Definition
  const activeRoom = useMemo(() => {
    return rooms.find((r) => r.id === activeRoomId) || rooms[0] || JNU_DEFAULT_ROOMS[0];
  }, [rooms, activeRoomId]);

  const {
    conversations: directConversations,
    unreadConversationIds: unreadDirectConversationIds,
    startConversation,
    markRead: markDirectConversationRead
  } = useDirectMessages(currentUser);

  // Clear unread count for newly selected room
  const handleSelectRoom = useCallback((roomId: string) => {
    setReplyTo(null);
    setActiveDirectConversationId(null);
    setActiveDirectPeer(null);
    setActiveRoomId(roomId);
    setUnreadCounts((prev) => {
      if (!prev[roomId]) return prev;
      const copy = { ...prev };
      delete copy[roomId];
      return copy;
    });
  }, []);

  const handleSelectDirectConversation = useCallback((conversation: DirectConversation) => {
    setReplyTo(null);
    setActiveDirectConversationId(conversation.id);
    setActiveDirectPeer(conversation.peer);
    void markDirectConversationRead(conversation.id);
  }, [markDirectConversationRead]);

  const handleStartDirectConversation = useCallback(async (peer: ChatUser) => {
    const conversationId = await startConversation(peer);
    setReplyTo(null);
    setActiveDirectConversationId(conversationId);
    setActiveDirectPeer(peer);
    await markDirectConversationRead(conversationId);
  }, [startConversation, markDirectConversationRead]);

  // 7. Presence Hook (Heartbeat, Typing Indicator debouncing, Stream Latency)
  const { onlineMembers, typingUsers, latencyMs, sendTyping } = usePresence(
    currentUser,
    activeDirectConversationId || activeRoom.id
  );

  const liveDirectConversations = useMemo(() => directConversations.map((conversation) => {
    const livePeer = onlineMembers.find((member) => member.uid === conversation.peer.uid);
    return {
      ...conversation,
      peer: {
        ...conversation.peer,
        status: livePeer?.status || 'offline'
      }
    };
  }), [directConversations, onlineMembers]);

  const activeDirectUser = useMemo(() => {
    if (!activeDirectPeer) return null;
    const livePeer = onlineMembers.find((member) => member.uid === activeDirectPeer.uid);
    return { ...activeDirectPeer, status: livePeer?.status || 'offline' };
  }, [activeDirectPeer, onlineMembers]);

  useEffect(() => {
    if (!currentUser?.uid) {
      setActiveDirectConversationId(null);
      setActiveDirectPeer(null);
      setNewDirectMessageModalOpen(false);
      return;
    }

    if (!activeDirectConversationId) return;
    void markDirectConversationRead(activeDirectConversationId);
  }, [
    currentUser?.uid,
    activeDirectConversationId,
    directConversations.find((item) => item.id === activeDirectConversationId)?.lastMessageAt,
    markDirectConversationRead
  ]);

  const activeMessageRoomId = activeDirectConversationId || activeRoom.id;

  const handleOpenNotification = useCallback((notification: AppNotification) => {
    if (notification.roomId) {
      if (isDirectConversationId(notification.roomId)) {
        const conversation = directConversations.find((item) => item.id === notification.roomId);
        if (!conversation) {
          setPendingNotificationRoute({ roomId: notification.roomId, messageId: notification.messageId });
          return;
        }
        handleSelectDirectConversation(conversation);
      } else {
        if (!rooms.some((room) => room.id === notification.roomId)) {
          setPendingNotificationRoute({ roomId: notification.roomId, messageId: notification.messageId });
          return;
        }
        handleSelectRoom(notification.roomId);
      }
      setNotificationMessageId(notification.messageId || null);
      return;
    }
    if (notification.callId) setCallHistoryModalOpen(true);
  }, [directConversations, rooms, handleSelectDirectConversation, handleSelectRoom]);

  const onNotificationJumpComplete = useCallback(() => setNotificationMessageId(null), []);

  useEffect(() => {
    const readRoute = (urlValue: string) => {
      try {
        const url = new URL(urlValue, window.location.origin);
        const roomId = url.searchParams.get('notificationRoom') || undefined;
        const messageId = url.searchParams.get('notificationMessage') || undefined;
        const callId = url.searchParams.get('notificationCall') || undefined;
        if (roomId || callId) setPendingNotificationRoute({ roomId, messageId, callId });
      } catch {
        // Ignore malformed notification links.
      }
    };

    readRoute(window.location.href);
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'pulsechat-notification-click' && typeof event.data.url === 'string') {
        readRoute(event.data.url);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
  }, []);

  useEffect(() => {
    if (!currentUser || !pendingNotificationRoute) return;
    const target = pendingNotificationRoute;
    if (target.roomId) {
      if (isDirectConversationId(target.roomId)) {
        const conversation = directConversations.find((item) => item.id === target.roomId);
        if (!conversation) return;
        handleSelectDirectConversation(conversation);
      } else {
        if (!rooms.some((room) => room.id === target.roomId)) return;
        handleSelectRoom(target.roomId);
      }
      setNotificationMessageId(target.messageId || null);
    }
    if (target.callId) setCallHistoryModalOpen(true);
    window.history.replaceState(window.history.state, '', window.location.pathname);
    setPendingNotificationRoute(null);
  }, [currentUser?.uid, pendingNotificationRoute, directConversations, rooms, handleSelectDirectConversation, handleSelectRoom]);

  // 8. Messages Hook (Virtualization, Optimistic delivery, Offline IDB cache, Outbox queue)
  const {
    messages,
    isOnline,
    initialLoading,
    sendMessage,
    beginAttachmentUpload,
    updateAttachmentUploadProgress,
    completeAttachmentUpload,
    failAttachmentUpload,
    retryAttachmentUpload,
    retryMessage,
    toggleReaction,
    deleteMessage
  } = useMessages(
    activeMessageRoomId,
    currentUser,
    playSent,
    playReceived,
    lightTap
  );

  // 9. Media & Attachments Hook (S3 direct upload, voice note recording, clipboard paste)
  const {
    stagedFile,
    stagedPreview,
    isUploading,
    uploadError,
    isRecording,
    recordingSeconds,
    stageFile,
    clearStagedFile,
    handleClipboardPaste,
    startRecording,
    stopRecording,
    cancelRecording,
    uploadCurrentAttachment
  } = useAttachments();

  useEffect(() => {
    clearStagedFile();
    if (isRecording) cancelRecording();
    setReplyTo(null);
    // Staged-file cleanup changes identity with its preview; key this effect to
    // the selected chat so switching conversations cannot carry drafts/media.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMessageRoomId]);

  const pendingUploadFilesRef = useRef<Map<string, File>>(new Map());

  const startBackgroundUpload = useCallback(
    (clientTempId: string, file: File) => {
      pendingUploadFilesRef.current.set(clientTempId, file);
      void uploadCurrentAttachment(file, (progress) => {
        updateAttachmentUploadProgress(clientTempId, progress);
      })
        .then((attachment) => {
          pendingUploadFilesRef.current.delete(clientTempId);
          return completeAttachmentUpload(clientTempId, attachment);
        })
        .catch((uploadErr: unknown) => {
          const message = uploadErr instanceof Error ? uploadErr.message : 'File upload failed';
          console.error('[Upload] S3 upload failed:', uploadErr);
          failAttachmentUpload(clientTempId, `Upload failed: ${message}. Select the file again to retry.`);
          addToast(message, 'error');
        });
    },
    [uploadCurrentAttachment, updateAttachmentUploadProgress, completeAttachmentUpload, failAttachmentUpload, addToast]
  );

  const handleRetryMessage = useCallback(
    (clientTempId: string) => {
      const file = pendingUploadFilesRef.current.get(clientTempId);
      if (!file) {
        retryMessage(clientTempId);
        return;
      }
      retryAttachmentUpload(clientTempId);
      startBackgroundUpload(clientTempId, file);
    },
    [retryMessage, retryAttachmentUpload, startBackgroundUpload]
  );

  // File messages appear immediately and upload in the background. The input is
  // cleared before the transfer starts, so the user can keep chatting or attach
  // another file while this upload runs.
  const handleSendMessage = useCallback(
    async (text: string, file?: File | null, mentions: string[] = []) => {
      if (!currentUser) {
        setAuthModalOpen(true);
        return;
      }

      if (file) {
        const validation = validateAttachment(file);
        if (!validation.valid || !validation.mimeType || !validation.category) {
          addToast(validation.error || 'This file cannot be uploaded.', 'error');
          return;
        }
        const mimeType = validation.mimeType;
        const previewUrl = validation.category === 'image' || validation.category === 'video'
          ? URL.createObjectURL(file)
          : undefined;
        if (previewUrl) localPreviewUrlsRef.current.add(previewUrl);
        const pendingAttachment: MessageAttachment = {
          key: '',
          fileName: file.name,
          name: file.name,
          fileSize: file.size,
          size: file.size,
          mimeType,
          type: mimeType,
          category: validation.category,
          previewUrl,
          uploadState: 'uploading',
          uploadProgress: 0
        };
        const clientTempId = beginAttachmentUpload(text, pendingAttachment, replyTo, mentions);
        if (!clientTempId) {
          if (pendingAttachment.previewUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(pendingAttachment.previewUrl);
            localPreviewUrlsRef.current.delete(pendingAttachment.previewUrl);
          }
          return;
        }
        clearStagedFile();

        startBackgroundUpload(clientTempId, file);
        return;
      }

      await sendMessage(text, null, replyTo, mentions);
      clearStagedFile();
    },
    [
      currentUser,
      sendMessage,
      replyTo,
      clearStagedFile,
      beginAttachmentUpload,
      startBackgroundUpload,
      addToast
    ]
  );

  // Toggle Reaction with Haptic & Sound
  const handleToggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      if (!currentUser) {
        setAuthModalOpen(true);
        return;
      }
      playReaction();
      lightTap();
      toggleReaction(messageId, emoji);
    },
    [currentUser, playReaction, lightTap, toggleReaction]
  );

  // Create Channel
  const handleCreateChannel = useCallback(
    async (channelData: { name: string; slug: string; icon: string; topic: string }) => {
      if (!currentUser) {
        setAuthModalOpen(true);
        return;
      }

      const id = channelData.slug;
      const newRoom: ChatRoom = {
        id,
        name: channelData.name,
        slug: channelData.slug,
        icon: channelData.icon,
        topic: channelData.topic,
        isCustom: true,
        createdAt: Date.now(),
        createdBy: currentUser.uid
      };

      const col = collection(db, 'custom_rooms');
      await addDoc(col, newRoom);

      setActiveRoomId(id);
      setIsSidebarOpenMobile(false);
    },
    [currentUser]
  );

  // Toggle Theme
  const handleToggleTheme = useCallback(() => {
    const newTheme = preferences.theme === 'dark' ? 'light' : 'dark';
    updatePreferences({ theme: newTheme });
  }, [preferences.theme, updatePreferences]);

  // Hardware Back Button & Mobile Gesture Support
  const hasActiveOverlay = Boolean(
    authModalOpen ||
    accountModalOpen ||
    channelInfoModalOpen ||
    createChannelModalOpen ||
    newDirectMessageModalOpen ||
    installOnboardingOpen ||
    callHistoryModalOpen ||
    lightboxUrl ||
    isSidebarOpenMobile
  );

  const notificationCenter = currentUser ? (
    <NotificationCenter
      currentUser={currentUser}
      activeRoomId={activeMessageRoomId}
      notifications={notificationState.notifications}
      unreadCount={notificationState.unreadCount}
      hasMore={notificationState.hasMore}
      loadingMore={notificationState.loadingMore}
      settings={notificationState.settings}
      mutedRoomIds={notificationState.mutedRoomIds}
      pushReady={notificationState.pushReady}
      pushBusy={notificationState.pushBusy}
      pushError={notificationState.pushError}
      onMarkRead={notificationState.markAsRead}
      onMarkAllRead={notificationState.markAllAsRead}
      onLoadMore={notificationState.loadMore}
      onDelete={notificationState.deleteNotification}
      onUpdateSettings={notificationState.updateSettings}
      onToggleMute={notificationState.toggleRoomMute}
      onEnablePush={notificationState.enableBrowserNotifications}
      onDisablePush={notificationState.disableBrowserNotifications}
      onOpenNotification={handleOpenNotification}
    />
  ) : null;

  useEffect(() => {
    if (hasActiveOverlay) {
      window.history.pushState({ modalOpen: true }, '');
    }

    const handlePopState = () => {
      if (lightboxUrl) {
        setLightboxUrl(null);
      } else if (authModalOpen) {
        setAuthModalOpen(false);
      } else if (accountModalOpen) {
        setAccountModalOpen(false);
      } else if (channelInfoModalOpen) {
        setChannelInfoModalOpen(false);
      } else if (createChannelModalOpen) {
        setCreateChannelModalOpen(false);
      } else if (newDirectMessageModalOpen) {
        setNewDirectMessageModalOpen(false);
      } else if (callHistoryModalOpen) {
        setCallHistoryModalOpen(false);
      } else if (installOnboardingOpen) {
        setInstallOnboardingOpen(false);
      } else if (isSidebarOpenMobile) {
        setIsSidebarOpenMobile(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    hasActiveOverlay,
    lightboxUrl,
    authModalOpen,
    accountModalOpen,
    channelInfoModalOpen,
    createChannelModalOpen,
    newDirectMessageModalOpen,
    callHistoryModalOpen,
    installOnboardingOpen,
    isSidebarOpenMobile
  ]);

  return (
    <>
      <AppLayout
        rooms={rooms}
        activeRoom={activeRoom}
        activeDirectUser={activeDirectUser}
        activeDirectConversationId={activeDirectConversationId}
        directConversations={liveDirectConversations}
        unreadDirectConversationIds={unreadDirectConversationIds}
        onSelectRoom={handleSelectRoom}
        onSelectDirectConversation={handleSelectDirectConversation}
        onOpenNewDirectMessage={() => {
          if (!currentUser) setAuthModalOpen(true);
          else setNewDirectMessageModalOpen(true);
        }}
        currentUser={currentUser}
        preferences={preferences}
        onToggleTheme={handleToggleTheme}
        onlineCount={onlineMembers.length}
        isOnline={isOnline}
        messages={messages}
        initialLoading={initialLoading}
        typingUsers={typingUsers}
        onSendMessage={handleSendMessage}
        onTyping={sendTyping}
        replyTo={replyTo}
        onSetReplyTo={setReplyTo}
        stagedFile={stagedFile}
        stagedPreview={stagedPreview}
        isUploading={isUploading}
        uploadError={uploadError}
        isRecording={isRecording}
        recordingSeconds={recordingSeconds}
        onStageFile={stageFile}
        onClearStagedFile={clearStagedFile}
        onClipboardPaste={handleClipboardPaste}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onCancelRecording={cancelRecording}
        onRetryMessage={handleRetryMessage}
        onReaction={handleToggleReaction}
        onDeleteMessage={deleteMessage}
        onImageClick={(url, name) => {
          setLightboxUrl(url);
          setLightboxName(name);
        }}
        onOpenCreateChannel={() => setCreateChannelModalOpen(true)}
        onOpenAccountModal={() => {
          if (!currentUser) setAuthModalOpen(true);
          else setAccountModalOpen(true);
        }}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onOpenChannelInfo={() => setChannelInfoModalOpen(true)}
        isSidebarOpenMobile={isSidebarOpenMobile}
        setIsSidebarOpenMobile={setIsSidebarOpenMobile}
        isDesktopSidebarOpen={isDesktopSidebarOpen}
        setIsDesktopSidebarOpen={setIsDesktopSidebarOpen}
        toasts={toasts}
        onDismissToast={dismissToast}
        unreadCounts={unreadCounts}
        canInstallApp={Boolean(currentUser) && canInstall && !installOnboardingOpen}
        onInstallApp={promptInstall}
        onStartVoiceCall={handleStartVoiceCall}
        onStartVideoCall={handleStartVideoCall}
        onOpenCallHistory={() => setCallHistoryModalOpen(true)}
        notificationCenter={notificationCenter}
        mentionUsers={onlineMembers.filter((member) => member.uid !== currentUser?.uid)}
        jumpToMessageId={notificationMessageId}
        onJumpMessageComplete={onNotificationJumpComplete}
      />

      {/* Modals & Overlays */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onGoogleSignIn={loginWithGoogle}
        onEmailSignIn={loginWithEmail}
        onEmailSignUp={registerWithEmail}
        onGuestSignIn={loginAsGuest}
      />

      <AccountModal
        isOpen={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        currentUser={currentUser}
        preferences={preferences}
        onUpdateProfile={updateUserProfile}
        onUpdatePreferences={updatePreferences}
        onLogout={logout}
        onShowToast={(txt) => addToast(txt, 'success')}
      />

      <ChannelInfoModal
        isOpen={channelInfoModalOpen && !activeDirectConversationId}
        onClose={() => setChannelInfoModalOpen(false)}
        room={activeRoom}
        onlineMembers={onlineMembers}
        latencyMs={latencyMs}
        currentUser={currentUser}
        onStartCall={startCall}
      />

      <CreateChannelModal
        isOpen={createChannelModalOpen}
        onClose={() => setCreateChannelModalOpen(false)}
        onCreateChannel={handleCreateChannel}
        onShowToast={(txt) => addToast(txt, 'success')}
      />

      <NewDirectMessageModal
        isOpen={newDirectMessageModalOpen}
        currentUser={currentUser}
        onlineUsers={onlineMembers}
        onClose={() => setNewDirectMessageModalOpen(false)}
        onSelectUser={handleStartDirectConversation}
      />

      <LightboxModal
        isOpen={Boolean(lightboxUrl)}
        onClose={() => setLightboxUrl(null)}
        imageUrl={lightboxUrl}
        fileName={lightboxName}
      />

      {installOnboardingOpen && currentUser && (
        <PwaInstallModal
          canInstall={canInstall}
          onInstall={promptInstall}
          onClose={() => {
            rememberInstallOnboardingDismissal(currentUser.uid);
            setInstallOnboardingOpen(false);
          }}
        />
      )}

      {/* Real-time Voice & Video Calling Modals & Overlays */}
      <IncomingCallModal
        incomingCall={incomingCall}
        onAccept={acceptCall}
        onReject={rejectCall}
      />

      <OutgoingCallModal
        activeCall={activeCall?.status !== 'connected' ? activeCall : null}
        onCancel={endCall}
      />

      {activeCall && activeCall.status === 'connected' && currentUser && (
        <CallWindow
          activeCall={activeCall}
          credentials={meetingCredentials}
          currentUserId={currentUser.uid}
          onEndCall={endCall}
        />
      )}

      <CallHistoryModal
        isOpen={callHistoryModalOpen}
        onClose={() => setCallHistoryModalOpen(false)}
        callHistory={callHistory}
        onStartCall={startCall}
      />
    </>
  );
};
export default App;
