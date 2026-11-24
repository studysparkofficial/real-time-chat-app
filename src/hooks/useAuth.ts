import { useState, useEffect, useCallback } from 'react';
import {
  auth,
  db,
  doc,
  setDoc,
  onAuthStateChanged,
  updateProfile,
  signInGoogle,
  checkRedirectAuth,
  signInEmail,
  signUpEmail,
  signInGuest,
  logOut,
  functions,
  httpsCallable
} from '../services/firebase';
import { ChatUser, UserPreferences, UserPresenceStatus } from '../types/chat.types';

const PREFS_KEY = 'pulsechat_user_preferences';

const DEFAULT_PREFS: UserPreferences = {
  theme: 'dark',
  soundEnabled: true,
  hapticsEnabled: true,
};

function getBrowserDeviceId(): string {
  const key = 'pulsechat_browser_device_id';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device_${Date.now()}_${Math.random().toString(36).slice(2, 18)}`;
    localStorage.setItem(key, id);
    return id;
  } catch {
    try {
      const sessionKey = `${key}_session`;
      const existing = sessionStorage.getItem(sessionKey);
      if (existing) return existing;
      const id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 18)}`;
      sessionStorage.setItem(sessionKey, id);
      return id;
    } catch {
      return `device_${Date.now()}_${Math.random().toString(36).slice(2, 18)}`;
    }
  }
}

function browserDeviceLabel(): string {
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(agent)) return 'Apple mobile browser';
  if (/Android/i.test(agent)) return 'Android browser';
  if (/Edg\//i.test(agent)) return 'Edge browser';
  if (/Firefox\//i.test(agent)) return 'Firefox browser';
  if (/Chrome\//i.test(agent)) return 'Chrome browser';
  if (/Safari\//i.test(agent)) return 'Safari browser';
  return 'Browser';
}

export function useAuth() {
  const [user, setUser] = useState<ChatUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY);
      return saved ? { ...DEFAULT_PREFS, ...JSON.parse(saved) } : DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  });

  // Apply theme class to document element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', preferences.theme);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
    } catch {
      // storage unavailable
    }
  }, [preferences]);

  // Check initial auth state & redirect results
  useEffect(() => {
    let unsubscribe: () => void;

    async function initAuth() {
      // Check if arriving from mobile Google redirect
      await checkRedirectAuth();

      unsubscribe = onAuthStateChanged(auth, (fbUser) => {
        if (fbUser) {
          const chatUser: ChatUser = {
            uid: fbUser.uid,
            displayName: fbUser.displayName || (fbUser.isAnonymous ? 'Guest Scholar' : 'JNU Scholar'),
            email: fbUser.email,
            photoURL: fbUser.photoURL || '👤',
            isAnonymous: fbUser.isAnonymous,
            status: 'online',
            bio: 'Scholar at JNUverse',
            lastSeen: Date.now()
          };
          setUser(chatUser);
          const recordSession = httpsCallable(functions, 'recordNewSession');
          void recordSession({ deviceId: getBrowserDeviceId(), deviceLabel: browserDeviceLabel() })
            .catch((error) => console.warn('[Security] Session notification could not be recorded:', error));
          void setDoc(
            doc(db, 'user_profiles', fbUser.uid),
            {
              uid: fbUser.uid,
              displayName: chatUser.displayName,
              displayNameLower: chatUser.displayName.toLocaleLowerCase(),
              photoURL: chatUser.photoURL || '👤',
              isAnonymous: Boolean(fbUser.isAnonymous),
              status: 'online',
              updatedAt: Date.now()
            },
            { merge: true }
          ).catch((error) => {
            console.warn('[Profiles] Profile sync failed:', error);
          });
        } else {
          setUser(null);
        }
        setLoading(false);
      });
    }

    initAuth();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setLoading(true);
    try {
      await signInGoogle();
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithEmail = useCallback(async (email: string, pass: string) => {
    setLoading(true);
    try {
      await signInEmail(email, pass);
    } finally {
      setLoading(false);
    }
  }, []);

  const registerWithEmail = useCallback(async (email: string, pass: string, name: string) => {
    setLoading(true);
    try {
      await signUpEmail(email, pass, name);
    } finally {
      setLoading(false);
    }
  }, []);

  const loginAsGuest = useCallback(async (name?: string) => {
    setLoading(true);
    try {
      await signInGuest(name);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (user) {
      try {
        // Mark status offline in Firestore
        await setDoc(
          doc(db, 'online_users', user.uid),
          { status: 'offline', lastSeen: Date.now() },
          { merge: true }
        );
      } catch {
        // Ignore
      }
    }
    await logOut();
    setUser(null);
  }, [user]);

  const updateUserProfile = useCallback(
    async (updates: { displayName?: string; photoURL?: string; bio?: string; status?: UserPresenceStatus }) => {
      if (!auth.currentUser || !user) return;

      const fbUpdates: { displayName?: string; photoURL?: string } = {};
      if (updates.displayName !== undefined) fbUpdates.displayName = updates.displayName;
      if (updates.photoURL !== undefined) fbUpdates.photoURL = updates.photoURL;

      if (Object.keys(fbUpdates).length > 0) {
        await updateProfile(auth.currentUser, fbUpdates);
      }

      const updatedUser: ChatUser = {
        ...user,
        ...updates
      };
      setUser(updatedUser);

      // Sync the public directory profile and live presence separately.
      await Promise.all([
        setDoc(
          doc(db, 'online_users', user.uid),
          {
            uid: user.uid,
            displayName: updatedUser.displayName,
            photoURL: updatedUser.photoURL,
            status: updatedUser.status,
            bio: updatedUser.bio,
            lastSeen: Date.now()
          },
          { merge: true }
        ),
        setDoc(
          doc(db, 'user_profiles', user.uid),
          {
            uid: user.uid,
            displayName: updatedUser.displayName,
            displayNameLower: updatedUser.displayName.toLocaleLowerCase(),
            photoURL: updatedUser.photoURL,
            isAnonymous: Boolean(updatedUser.isAnonymous),
            status: updatedUser.status,
            updatedAt: Date.now()
          },
          { merge: true }
        )
      ]);
    },
    [user]
  );

  const updatePreferences = useCallback((newPrefs: Partial<UserPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...newPrefs }));
  }, []);

  return {
    user,
    loading,
    preferences,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    loginAsGuest,
    logout,
    updateUserProfile,
    updatePreferences
  };
}
