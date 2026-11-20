/**
 * Firebase Initialization & Services
 * Authentication (Google & Email) + Firestore (Real-Time Cloud Messaging)
 * Configured for PulseChat — 100% Serverless & GitHub Pages Ready
 */
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInAnonymously,
  updateProfile,
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp
} from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDe_QOhe9wStqooqUapOZiWDStSZ6grXUo",
  authDomain: "real-time-chat-app-dbaf1.firebaseapp.com",
  projectId: "real-time-chat-app-dbaf1",
  storageBucket: "real-time-chat-app-dbaf1.firebasestorage.app",
  messagingSenderId: "829237726799",
  appId: "1:829237726799:web:9c96afb60489fd6434e43a"
};

// Initialize Firebase App, Auth & Firestore
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// ==================== AUTHENTICATION SERVICES ====================

// Google Sign-In with Popup
export async function signInWithGoogle() {
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

// Google Sign-In with Redirect (Safari / Mobile friendly)
export async function signInWithGoogleRedirect() {
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  await signInWithRedirect(auth, googleProvider);
}

// Check for incoming redirect sign-in result on page load
export async function checkRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    return result ? result.user : null;
  } catch (err) {
    console.error('Redirect sign-in error:', err);
    throw err;
  }
}

// Email & Password Sign-In
export async function signInWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

// Email & Password Registration
export async function registerWithEmail(email, password, displayName) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName && displayName.trim()) {
    await updateProfile(result.user, { displayName: displayName.trim() });
  }
  return result.user;
}

// Guest chat uses Firebase Anonymous Auth so Firestore rules can require a signed-in user.
export async function signInAsGuest() {
  const result = await signInAnonymously(auth);
  return result.user;
}

// Update Firebase Auth user profile
export async function updateFirebaseUserProfile(displayName, photoURL) {
  if (auth.currentUser) {
    const profileUpdates = {};
    if (displayName !== undefined && displayName !== null) profileUpdates.displayName = String(displayName).trim();
    if (photoURL !== undefined && photoURL !== null) profileUpdates.photoURL = String(photoURL);
    await updateProfile(auth.currentUser, profileUpdates);
    return auth.currentUser;
  }
  return null;
}

// Sign Out
export async function logOut() {
  return await signOut(auth);
}

// Observe Auth state
export function onAuthUserChanged(callback, onError) {
  return onAuthStateChanged(auth, callback, onError);
}

// ==================== FIRESTORE REAL-TIME MESSAGING ====================

// Send a chat message to a room with timeout protection and consistent doc ID
export async function sendMessageToFirestore(roomId, messageData) {
  // Use caller-provided ID to guarantee Firestore document ID matches local optimistic message ID
  const docId = messageData.id || doc(collection(db, 'rooms', roomId, 'messages')).id;
  const msgDocRef = doc(db, 'rooms', roomId, 'messages', docId);

  const payload = {
    id: docId,
    clientMsgId: docId,
    roomId: messageData.roomId || roomId,
    text: messageData.text || '',
    sender: {
      username: messageData.sender.username,
      avatar: messageData.sender.avatar || '⚡',
      email: messageData.sender.email || null,
      uid: messageData.sender.uid || null
    },
    senderId: messageData.senderId || messageData.sender?.uid || null,
    type: messageData.type || (messageData.attachment ? (messageData.attachment.mimeType?.startsWith('image/') || messageData.attachment.type?.startsWith('image/') ? 'image' : messageData.attachment.mimeType?.startsWith('video/') || messageData.attachment.type?.startsWith('video/') ? 'video' : messageData.attachment.mimeType === 'application/pdf' ? 'pdf' : 'file') : (messageData.codeSnippet ? 'code' : 'text')),
    replyTo: messageData.replyTo || null,
    attachment: messageData.attachment ? {
      key: messageData.attachment.key || null,
      name: messageData.attachment.name || 'attachment',
      mimeType: messageData.attachment.mimeType || messageData.attachment.type || 'application/octet-stream',
      type: messageData.attachment.type || messageData.attachment.mimeType || 'application/octet-stream',
      size: messageData.attachment.size || 0,
      data: messageData.attachment.data || null
    } : null,
    codeSnippet: messageData.codeSnippet || null,
    reactions: messageData.reactions || {},
    timestamp: messageData.timestamp || Date.now(),
    createdAt: serverTimestamp()
  };

  const savePromise = setDoc(msgDocRef, payload);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cloud sync timeout: verify Firestore Database is created in Firebase Console')), 8000)
  );

  await Promise.race([savePromise, timeoutPromise]);
  return payload;
}

// Listen to room messages in real time
export function listenToRoomMessages(roomId, callback, onError) {
  const messagesCol = collection(db, 'rooms', roomId, 'messages');
  // Fetch the newest 150, then reverse them for chronological rendering.
  const q = query(messagesCol, orderBy('timestamp', 'desc'), limit(150));
  return onSnapshot(q, (snapshot) => {
    const messages = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      messages.push({
        ...data,
        id: docSnap.id,
        clientMsgId: data.clientMsgId || docSnap.id
      });
    });
    callback(messages.reverse());
  }, (err) => {
    console.warn('Firestore messages listener error:', err);
    if (onError) onError(err);
  });
}

// Toggle message reaction
export async function toggleFirestoreReaction(roomId, messageId, emoji, username) {
  const msgDocRef = doc(db, 'rooms', roomId, 'messages', messageId);
  // Read current reactions and update
  return await setDoc(msgDocRef, {
    // We update through a merge or transaction
  }, { merge: true });
}

export async function updateMessageReactionsInFirestore(roomId, messageId, newReactions) {
  try {
    const msgDocRef = doc(db, 'rooms', roomId, 'messages', messageId);
    return await updateDoc(msgDocRef, {
      reactions: newReactions
    });
  } catch (err) {
    console.warn('Reactions sync error:', err);
  }
}

// Typing indicators
export async function setFirestoreTyping(roomId, username, isTyping) {
  if (!username) return;
  const safeUserKey = encodeURIComponent(username).replace(/\./g, '_');
  const typingDocRef = doc(db, 'rooms', roomId, 'typing', safeUserKey);
  try {
    if (isTyping) {
      return await setDoc(typingDocRef, {
        username,
        updatedAt: Date.now()
      });
    } else {
      return await deleteDoc(typingDocRef);
    }
  } catch (e) {
    // Gracefully ignore typing sync errors
  }
}

export function listenToFirestoreTyping(roomId, currentUsername, callback) {
  const typingCol = collection(db, 'rooms', roomId, 'typing');
  return onSnapshot(typingCol, (snapshot) => {
    const typers = [];
    const now = Date.now();
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // Only include typing within the last 5 seconds and not self
      if (data.username && data.username !== currentUsername && (now - (data.updatedAt || 0) < 5000)) {
        typers.push(data.username);
      }
    });
    callback(typers);
  }, (err) => {
    console.warn('Typing listener error:', err);
  });
}

// Online Presence
export async function updateUserPresence(userData, isOnline = true) {
  if (!userData || !userData.username) return;
  const userKey = userData.uid || encodeURIComponent(userData.username).replace(/\./g, '_');
  const userRef = doc(db, 'online_users', userKey);
  try {
    if (isOnline) {
      return await setDoc(userRef, {
        username: userData.username,
        avatar: userData.avatar || '⚡',
        email: userData.email || null,
        uid: userData.uid || null,
        status: userData.status || 'online',
        room: userData.room || 'general',
        lastSeen: Date.now()
      }, { merge: true });
    } else {
      return await deleteDoc(userRef);
    }
  } catch (e) {
    console.warn('Presence sync error:', e);
  }
}

export function listenToOnlineUsers(callback) {
  const usersCol = collection(db, 'online_users');
  return onSnapshot(usersCol, (snapshot) => {
    const users = [];
    const now = Date.now();
    snapshot.forEach((docSnap) => {
      const u = docSnap.data();
      // Consider active if updated in the last 15 minutes
      if (now - (u.lastSeen || 0) < 15 * 60 * 1000) {
        users.push({
          id: docSnap.id,
          ...u
        });
      }
    });
    callback(users);
  }, (err) => {
    console.warn('Presence listener error:', err);
  });
}

// Custom channels
export async function saveCustomRoom(room) {
  const roomDoc = doc(db, 'custom_rooms', room.id);
  return await setDoc(roomDoc, room);
}

export function listenToCustomRooms(callback) {
  const roomsCol = collection(db, 'custom_rooms');
  return onSnapshot(roomsCol, (snapshot) => {
    const rooms = [];
    snapshot.forEach((docSnap) => {
      rooms.push(docSnap.data());
    });
    callback(rooms);
  }, (err) => {
    console.warn('Rooms listener error:', err);
  });
}
