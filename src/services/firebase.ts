import { initializeApp, getApps, getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  updateProfile,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  startAt,
  startAfter,
  endAt,
  getDocs,
  runTransaction,
  writeBatch,
  serverTimestamp,
  Firestore,
  FirestoreSettings
} from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyDe_QOhe9wStqooqUapOZiWDStSZ6grXUo",
  authDomain: "real-time-chat-app-dbaf1.firebaseapp.com",
  projectId: "real-time-chat-app-dbaf1",
  storageBucket: "real-time-chat-app-dbaf1.firebasestorage.app",
  messagingSenderId: "829237726799",
  appId: "1:829237726799:web:9c96afb60489fd6434e43a"
};

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firestore with Multi-Tab IndexedDb Persistence
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  } as FirestoreSettings);
} catch (e) {
  firestoreInstance = getFirestore(app);
}

export const db = firestoreInstance;
export const functions = getFunctions(
  app,
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1'
);
export { httpsCallable };

const env = (import.meta as unknown as { env?: Record<string, string> }).env;
if (typeof window !== 'undefined' && env?.VITE_USE_FIREBASE_EMULATORS === 'true') {
  const emulatorHost = env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8080);
  connectFunctionsEmulator(functions, emulatorHost, 5001);
}

// Helper: Check if user is on mobile
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Google Sign-In with popup + fallback to redirect
export async function signInGoogle(): Promise<FirebaseUser | null> {
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  if (isMobileDevice()) {
    await signInWithRedirect(auth, googleProvider);
    return null;
  }
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (err: unknown) {
    const error = err as { code?: string };
    if (
      error.code === 'auth/popup-blocked' ||
      error.code === 'auth/popup-closed-by-user' ||
      error.code === 'auth/cancelled-popup-request'
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
}

// Resolve redirect result on initial boot
export async function checkRedirectAuth(): Promise<FirebaseUser | null> {
  try {
    const result = await getRedirectResult(auth);
    return result ? result.user : null;
  } catch (err) {
    console.warn('[Auth] Redirect sign in resolution:', err);
    return null;
  }
}

// Email & Password Auth
export async function signInEmail(email: string, pass: string): Promise<FirebaseUser> {
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  return cred.user;
}

export async function signUpEmail(email: string, pass: string, displayName?: string): Promise<FirebaseUser> {
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  if (displayName && cred.user) {
    await updateProfile(cred.user, { displayName });
  }
  return cred.user;
}

// Guest Sign-In (falls back to null when Anonymous Auth is disabled in Firebase Console)
export async function signInGuest(displayName?: string): Promise<FirebaseUser | null> {
  const guestName = displayName || `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
  try {
    const cred = await signInAnonymously(auth);
    if (cred.user) {
      try {
        await updateProfile(cred.user, { displayName: guestName });
      } catch {
        // Profile update failure should not block guest access
      }
    }
    return cred.user;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (
      code === 'auth/operation-not-allowed' ||
      code === 'auth/admin-restricted-operation' ||
      code === 'auth/unauthorized-domain'
    ) {
      console.warn(`[Auth] Anonymous auth unavailable (${code}); falling back to read-only guest session.`);
      return null;
    }
    throw err;
  }
}

// Sign out
export async function logOut(): Promise<void> {
  await signOut(auth);
}

export {
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  startAt,
  startAfter,
  endAt,
  getDocs,
  runTransaction,
  writeBatch,
  serverTimestamp,
  onAuthStateChanged,
  updateProfile
};
