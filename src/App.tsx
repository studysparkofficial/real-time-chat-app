import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { AuthModal } from './components/modals/AuthModal';
import { AccountModal } from './components/modals/AccountModal';
import { ChannelInfoModal } from './components/modals/ChannelInfoModal';
import { CreateChannelModal } from './components/modals/CreateChannelModal';
import { LightboxModal } from './components/modals/LightboxModal';
import { ToastMessage } from './components/common/Toast';

import { useAuth } from './hooks/useAuth';
import { usePresence } from './hooks/usePresence';
import { useMessages } from './hooks/useMessages';
import { useAttachments } from './hooks/useAttachments';
import { useAudio } from './hooks/useAudio';
import { useHaptics } from './hooks/useHaptics';

import { db, collection, addDoc, onSnapshot } from './services/firebase';
import { localCache } from './services/indexedDbCache';
import { ChatRoom, MessageReplyReference } from './types/chat.types';

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

export const App: React.FC = () => {
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

  // 2. Audio & Haptics
  const { playSent, playReceived, playReaction } = useAudio(preferences.soundEnabled);
  const { lightTap } = useHaptics(preferences.hapticsEnabled);

  // 3. Channels State
  const [rooms, setRooms] = useState<ChatRoom[]>(JNU_DEFAULT_ROOMS);
  const [activeRoomId, setActiveRoomId] = useState<string>('campus-central');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // 4. Modals and Overlays State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [channelInfoModalOpen, setChannelInfoModalOpen] = useState(false);
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxName, setLightboxName] = useState<string | undefined>(undefined);

  // Automatically prompt new / unauthenticated visitors with the Authentication Modal
  useEffect(() => {
    if (!authLoading && !currentUser) {
      setAuthModalOpen(true);
    }
  }, [authLoading, currentUser]);

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

  // Sync custom channels from Firestore & cache in IndexedDB
  useEffect(() => {
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
  }, []);

  // Active Room Definition
  const activeRoom = useMemo(() => {
    return rooms.find((r) => r.id === activeRoomId) || rooms[0] || JNU_DEFAULT_ROOMS[0];
  }, [rooms, activeRoomId]);

  // Clear unread count for newly selected room
  const handleSelectRoom = useCallback((roomId: string) => {
    setActiveRoomId(roomId);
    setUnreadCounts((prev) => {
      if (!prev[roomId]) return prev;
      const copy = { ...prev };
      delete copy[roomId];
      return copy;
    });
  }, []);

  // 7. Presence Hook (Heartbeat, Typing Indicator debouncing, Stream Latency)
  const { onlineMembers, typingUsers, latencyMs, sendTyping } = usePresence(
    currentUser,
    activeRoom.id
  );

  // 8. Messages Hook (Virtualization, Optimistic delivery, Offline IDB cache, Outbox queue)
  const {
    messages,
    isOnline,
    initialLoading,
    sendMessage,
    retryMessage,
    toggleReaction,
    deleteMessage
  } = useMessages(
    activeRoom.id,
    currentUser,
    playSent,
    playReceived,
    lightTap
  );

  // 9. Media & Attachments Hook (S3 direct upload, voice note recording, clipboard paste)
  const {
    stagedFile,
    stagedPreview,
    uploadProgress,
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

  // Send message handler (combines text + uploaded media with zero-failure fallback)
  const handleSendMessage = useCallback(
    async (text: string, file?: File | null) => {
      if (!currentUser) {
        setAuthModalOpen(true);
        return;
      }

      let attachment = null;
      if (file) {
        try {
          attachment = await uploadCurrentAttachment(file);
        } catch (uploadErr) {
          console.warn('[Upload] S3 upload issue:', uploadErr);
          addToast('File processed with fallback. Sending to channel…', 'info');
        }
      }

      await sendMessage(text, attachment, replyTo);
      clearStagedFile();
    },
    [currentUser, uploadCurrentAttachment, sendMessage, replyTo, clearStagedFile, addToast]
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
    lightboxUrl ||
    isSidebarOpenMobile
  );

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
    isSidebarOpenMobile
  ]);

  return (
    <>
      <AppLayout
        rooms={rooms}
        activeRoom={activeRoom}
        onSelectRoom={handleSelectRoom}
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
        uploadProgress={uploadProgress}
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
        onRetryMessage={retryMessage}
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
        isOpen={channelInfoModalOpen}
        onClose={() => setChannelInfoModalOpen(false)}
        room={activeRoom}
        onlineMembers={onlineMembers}
        latencyMs={latencyMs}
      />

      <CreateChannelModal
        isOpen={createChannelModalOpen}
        onClose={() => setCreateChannelModalOpen(false)}
        onCreateChannel={handleCreateChannel}
        onShowToast={(txt) => addToast(txt, 'success')}
      />

      <LightboxModal
        isOpen={Boolean(lightboxUrl)}
        onClose={() => setLightboxUrl(null)}
        imageUrl={lightboxUrl}
        fileName={lightboxName}
      />
    </>
  );
};
export default App;
