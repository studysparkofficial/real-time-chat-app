import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  db,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  functions,
  httpsCallable
} from '../services/firebase';
import { AppNotification, ChatUser, NotificationSettings } from '../types/chat.types';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  personalMessages: true,
  groupMessages: false,
  mentions: true,
  replies: true,
  reactions: true,
  voiceCalls: true,
  videoCalls: true,
  missedCalls: true,
  groupAnnouncements: true,
  statusNotifications: false,
  securityNotifications: true,
  systemNotifications: true,
  pushEnabled: false,
  sounds: true,
  messagePreviews: false,
  quietHours: { enabled: false, start: '22:00', end: '08:00', timeZone: 'Asia/Kolkata' }
};

function toMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - base64Url.length % 4) % 4);
  const base64 = `${base64Url}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function currentDefaults(): NotificationSettings {
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    quietHours: { ...DEFAULT_NOTIFICATION_SETTINGS.quietHours, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }
  };
}

export function useNotifications(currentUser: ChatUser | null) {
  const [latestNotifications, setLatestNotifications] = useState<AppNotification[]>([]);
  const [olderPages, setOlderPages] = useState<AppNotification[][]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>(currentDefaults);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mutedRoomIds, setMutedRoomIds] = useState<Set<string>>(new Set());
  const [pushReady, setPushReady] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const latestCursorRef = useRef<any>(null);
  const pageCursorRef = useRef<any>(null);
  const olderPagesHaveMoreRef = useRef(false);
  const olderPageListenersRef = useRef<Array<() => void>>([]);
  const olderPagesRef = useRef<AppNotification[][]>([]);

  const mapNotification = useCallback((notificationDoc: { id: string; data: () => Record<string, any> }): AppNotification => {
    const data = notificationDoc.data();
    return {
      id: notificationDoc.id,
      type: data.type,
      category: data.category,
      title: String(data.title || 'PulseChat'),
      body: String(data.body || ''),
      senderUid: data.senderUid || undefined,
      senderName: data.senderName || undefined,
      roomId: data.roomId || undefined,
      messageId: data.messageId || undefined,
      callId: data.callId || undefined,
      entityId: data.entityId || undefined,
      count: Math.max(1, Number(data.count || 1)),
      isRead: Boolean(data.isRead),
      createdAt: toMillis(data.createdAt)
    } as AppNotification;
  }, []);

  useEffect(() => {
    const uid = currentUser?.isAnonymous ? undefined : currentUser?.uid;
    if (!uid) {
      setLatestNotifications([]);
      setUnreadCount(0);
      olderPageListenersRef.current.forEach((unsubscribe) => unsubscribe());
      olderPageListenersRef.current = [];
      olderPagesRef.current = [];
      setOlderPages([]);
      latestCursorRef.current = null;
      pageCursorRef.current = null;
      olderPagesHaveMoreRef.current = false;
      setHasMore(false);
      setSettings(currentDefaults());
      setMutedRoomIds(new Set());
      setPushReady(false);
      return;
    }

    olderPageListenersRef.current.forEach((unsubscribe) => unsubscribe());
    olderPageListenersRef.current = [];
    olderPagesRef.current = [];
    setOlderPages([]);
    pageCursorRef.current = null;
    olderPagesHaveMoreRef.current = false;

    const notificationQuery = query(
      collection(db, `user_private/${uid}/notifications`),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubscribeNotifications = onSnapshot(notificationQuery, (snapshot) => {
      setLatestNotifications(snapshot.docs.map(mapNotification));
      latestCursorRef.current = snapshot.docs[snapshot.docs.length - 1] || null;
      if (olderPagesRef.current.length === 0) pageCursorRef.current = latestCursorRef.current;
      setHasMore(olderPagesRef.current.length > 0
        ? olderPagesHaveMoreRef.current
        : snapshot.size === 50);
    }, (error) => console.warn('[Notifications] Listener error:', error));

    const unreadQuery = query(
      collection(db, `user_private/${uid}/notifications`),
      where('isRead', '==', false)
    );
    const unsubscribeUnread = onSnapshot(unreadQuery, (snapshot) => setUnreadCount(snapshot.size), (error) => {
      console.warn('[Notifications] Unread count listener error:', error);
    });

    const settingsRef = doc(db, `user_private/${uid}/notification_settings`, 'preferences');
    const unsubscribeSettings = onSnapshot(settingsRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      setSettings({
        ...currentDefaults(),
        ...data,
        quietHours: { ...currentDefaults().quietHours, ...(data.quietHours || {}) }
      } as NotificationSettings);
    }, (error) => console.warn('[Notifications] Settings listener error:', error));

    const unsubscribeMuted = onSnapshot(collection(db, `user_private/${uid}/muted_rooms`), (snapshot) => {
      setMutedRoomIds(new Set(snapshot.docs.filter((entry) => entry.data().muted === true).map((entry) => entry.id)));
    }, (error) => console.warn('[Notifications] Muted-chat listener error:', error));

    let mounted = true;
    if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
      void navigator.serviceWorker.ready
        .then((registration) => registration.pushManager.getSubscription())
        .then((subscription) => {
          if (mounted) setPushReady(Boolean(subscription && Notification.permission === 'granted'));
        })
        .catch(() => {
          if (mounted) setPushReady(false);
        });
    }

    return () => {
      mounted = false;
      unsubscribeNotifications();
      unsubscribeUnread();
      unsubscribeSettings();
      unsubscribeMuted();
      olderPageListenersRef.current.forEach((unsubscribe) => unsubscribe());
      olderPageListenersRef.current = [];
    };
  }, [currentUser?.uid, mapNotification]);

  const notifications = useMemo(() => {
    const byId = new Map<string, AppNotification>();
    [...latestNotifications, ...olderPages.flat()].forEach((notification) => {
      if (!byId.has(notification.id)) byId.set(notification.id, notification);
    });
    return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  }, [latestNotifications, olderPages]);

  const loadMore = useCallback(async () => {
    const uid = currentUser?.uid;
    const cursor = pageCursorRef.current;
    if (!uid || !cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextQuery = query(
        collection(db, `user_private/${uid}/notifications`),
        orderBy('createdAt', 'desc'),
        startAfter(cursor),
        limit(50)
      );
      const snapshot = await getDocs(nextQuery);
      if (!snapshot.empty) {
        const pageIndex = olderPagesRef.current.length;
        pageCursorRef.current = snapshot.docs[snapshot.docs.length - 1];
        const nextPage = snapshot.docs.map(mapNotification);
        olderPagesRef.current = [...olderPagesRef.current, nextPage];
        setOlderPages(olderPagesRef.current);
        const unsubscribe = onSnapshot(nextQuery, (liveSnapshot) => {
          const livePage = liveSnapshot.docs.map(mapNotification);
          olderPagesRef.current = olderPagesRef.current.map((page, index) => index === pageIndex ? livePage : page);
          setOlderPages(olderPagesRef.current);
        }, (error) => console.warn('[Notifications] Older page listener error:', error));
        olderPageListenersRef.current.push(unsubscribe);
      } else {
        olderPagesHaveMoreRef.current = false;
      }
      olderPagesHaveMoreRef.current = snapshot.size === 50;
      setHasMore(olderPagesHaveMoreRef.current);
    } catch (error) {
      console.warn('[Notifications] Could not load older notifications:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [currentUser?.uid, hasMore, loadingMore, mapNotification]);

  const updateSettings = useCallback(async (patch: Partial<NotificationSettings>) => {
    if (!currentUser?.uid) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await setDoc(doc(db, `user_private/${currentUser.uid}/notification_settings`, 'preferences'), patch, { merge: true });
    } catch (error) {
      setSettings(settings);
      console.warn('[Notifications] Could not save settings:', error);
    }
  }, [currentUser?.uid, settings]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!currentUser?.uid) return;
    const notification = notifications.find((item) => item.id === notificationId);
    if (!notification || notification.isRead) return;
    try {
      await updateDoc(doc(db, `user_private/${currentUser.uid}/notifications`, notificationId), {
        isRead: true,
        readAt: serverTimestamp()
      });
    } catch (error) {
      console.warn('[Notifications] Could not mark notification as read:', error);
    }
  }, [currentUser?.uid, notifications]);

  const markAllAsRead = useCallback(async () => {
    if (!currentUser?.uid) return;
    try {
      const unreadSnapshot = await getDocs(query(
        collection(db, `user_private/${currentUser.uid}/notifications`),
        where('isRead', '==', false)
      ));
      const unreadIds = unreadSnapshot.docs.map((notification) => notification.id);
      if (unreadIds.length === 0) return;
      for (let offset = 0; offset < unreadIds.length; offset += 450) {
        const batch = writeBatch(db);
        unreadIds.slice(offset, offset + 450).forEach((notificationId) => batch.update(
          doc(db, `user_private/${currentUser.uid}/notifications`, notificationId),
          { isRead: true, readAt: serverTimestamp() }
        ));
        await batch.commit();
      }
    } catch (error) {
      console.warn('[Notifications] Could not mark all as read:', error);
    }
  }, [currentUser?.uid]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!currentUser?.uid) return;
    try {
      await deleteDoc(doc(db, `user_private/${currentUser.uid}/notifications`, notificationId));
    } catch (error) {
      console.warn('[Notifications] Could not delete notification:', error);
    }
  }, [currentUser?.uid]);

  const toggleRoomMute = useCallback(async (roomId: string) => {
    if (!currentUser?.uid || !roomId) return;
    const mutedRef = doc(db, `user_private/${currentUser.uid}/muted_rooms`, roomId);
    const muted = mutedRoomIds.has(roomId);
    try {
      if (muted) await deleteDoc(mutedRef);
      else await setDoc(mutedRef, { muted: true, updatedAt: serverTimestamp() });
    } catch (error) {
      console.warn('[Notifications] Could not update chat mute:', error);
    }
  }, [currentUser?.uid, mutedRoomIds]);

  const enableBrowserNotifications = useCallback(async () => {
    if (!currentUser?.uid) return false;
    setPushBusy(true);
    setPushError(null);
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Browser push notifications are not supported here.');
      }
      const vapidKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_WEB_PUSH_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error('Browser alerts are not configured on this deployment yet.');
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error(permission === 'denied'
          ? 'Notifications are blocked in browser settings. Allow them for this site, then try again.'
          : 'Browser notification permission was not granted.');
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(vapidKey)
      });
      const register = httpsCallable(functions, 'registerPushSubscription');
      await register({ subscription: subscription.toJSON() });
      setPushReady(true);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not enable browser alerts.';
      setPushError(message);
      return false;
    } finally {
      setPushBusy(false);
    }
  }, [currentUser?.uid]);

  const disableBrowserNotifications = useCallback(async () => {
    if (!currentUser?.uid) return;
    setPushBusy(true);
    setPushError(null);
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const unregister = httpsCallable(functions, 'unregisterPushSubscription');
          await unregister({ endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
      }
      await updateSettings({ pushEnabled: false });
      setPushReady(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not disable browser alerts.';
      setPushError(message);
    } finally {
      setPushBusy(false);
    }
  }, [currentUser?.uid, updateSettings]);

  return {
    notifications,
    unreadCount,
    hasMore,
    loadingMore,
    loadMore,
    settings,
    mutedRoomIds,
    pushReady,
    pushBusy,
    pushError,
    updateSettings,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    toggleRoomMute,
    enableBrowserNotifications,
    disableBrowserNotifications
  };
}
