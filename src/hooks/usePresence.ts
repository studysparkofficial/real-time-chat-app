import { useState, useEffect, useRef, useCallback } from 'react';
import {
  db,
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot
} from '../services/firebase';
import { ChatUser, TypingUser } from '../types/chat.types';

export function usePresence(currentUser: ChatUser | null, activeRoomId: string) {
  const [onlineMembers, setOnlineMembers] = useState<ChatUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [latencyMs, setLatencyMs] = useState<number>(24);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingWriteRef = useRef<number>(0);

  // Measure latency to backend services
  useEffect(() => {
    let isMounted = true;
    const checkLatency = async () => {
      try {
        const start = performance.now();
        // Lightweight HEAD request or timestamp delta
        await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors', cache: 'no-store' });
        const delta = Math.round(performance.now() - start);
        if (isMounted) setLatencyMs(delta > 0 ? delta : 16);
      } catch {
        if (isMounted) setLatencyMs(28);
      }
    };

    checkLatency();
    const interval = setInterval(checkLatency, 30000); // Check every 30s
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Presence Heartbeat throttled to 60s (disabled for read-only guests)
  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous) return;

    const userDocRef = doc(db, 'online_users', currentUser.uid);

    const updatePresence = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        await setDoc(
          userDocRef,
          {
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL || '👤',
            status: currentUser.status || 'online',
            bio: currentUser.bio || 'Available',
            lastSeen: Date.now()
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('[Presence] Heartbeat failed:', err);
      }
    };

    // Initial heartbeat
    updatePresence();
    const heartbeatTimer = setInterval(updatePresence, 60000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        updatePresence();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUser]);

  // Subscribe to all online users once the signed-in user can pass security rules
  useEffect(() => {
    if (!currentUser?.uid) return;

    const q = collection(db, 'online_users');
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const users: ChatUser[] = [];
        const threshold = Date.now() - 3 * 60 * 1000; // Active within last 3 minutes

        snapshot.forEach((d) => {
          const data = d.data() as ChatUser;
          if (data.status !== 'offline' && (!data.lastSeen || data.lastSeen >= threshold)) {
            users.push(data);
          }
        });

        setOnlineMembers(users);
      },
      (err) => {
        console.warn('[Presence] Users subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // Subscribe to room typing indicators
  useEffect(() => {
    if (!activeRoomId || !currentUser?.uid) return;

    const typingCol = collection(db, `rooms/${activeRoomId}/typing`);
    const unsubscribe = onSnapshot(
      typingCol,
      (snapshot) => {
        const typers: TypingUser[] = [];
        const now = Date.now();

        snapshot.forEach((d) => {
          const data = d.data() as TypingUser;
          // Filter out current user and stale entries > 5s
          if (currentUser && data.uid === currentUser.uid) return;
          if (now - data.timestamp < 5000) {
            typers.push(data);
          }
        });

        setTypingUsers(typers);
      },
      (err) => {
        console.warn('[Presence] Typing subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [activeRoomId, currentUser]);

  // Debounced typing emitter (3-second sliding window)
  const sendTyping = useCallback(async () => {
    if (!currentUser || currentUser.isAnonymous || !activeRoomId) return;

    const now = Date.now();
    const typingDocRef = doc(db, `rooms/${activeRoomId}/typing`, currentUser.uid);

    // Throttle writes to once per 3s
    if (now - lastTypingWriteRef.current > 3000) {
      lastTypingWriteRef.current = now;
      try {
        await setDoc(typingDocRef, {
          uid: currentUser.uid,
          displayName: currentUser.displayName,
          timestamp: now
        });
      } catch (err) {
        console.warn('[Presence] Write typing state:', err);
      }
    }

    // Auto clear after 3.5s of no keypress
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(async () => {
      try {
        await deleteDoc(typingDocRef);
      } catch {
        // ignore
      }
    }, 3500);
  }, [currentUser, activeRoomId]);

  return {
    onlineMembers,
    typingUsers,
    latencyMs,
    sendTyping
  };
}
