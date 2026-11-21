import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
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

// Guest Sign-In
export async function signInGuest(displayName?: string): Promise<FirebaseUser> {
  const cred = await signInAnonymously(auth);
  if (cred.user) {
    const guestName = displayName || `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
    await updateProfile(cred.user, { displayName: guestName });
  }
  return cred.user;
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
  serverTimestamp,
  onAuthStateChanged,
  updateProfile
};
