/**
 * PulseChat — Modern Real-Time Chat Application
 * Client-side Controller & Real-Time Sync via Firebase Firestore
 * 100% Serverless — Runs anywhere (GitHub Pages, Firebase Hosting, Local)
 */

import { 
  signInWithGoogle, 
  signInWithGoogleRedirect,
  checkRedirectResult,
  signInWithEmail, 
  registerWithEmail, 
  logOut, 
  onAuthUserChanged,
  sendMessageToFirestore,
  listenToRoomMessages,
  updateMessageReactionsInFirestore,
  setFirestoreTyping,
  listenToFirestoreTyping,
  updateUserPresence,
  listenToOnlineUsers,
  saveCustomRoom,
  listenToCustomRooms
} from "./firebase-config.js";

// --- Web Audio Notification Sound ---
class SoundFx {
  constructor() {
    this.audioCtx = null;
    this.enabled = localStorage.getItem('pulsechat_sound') !== 'false';
  }

  init() {
    if (!this.audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
  }

  playMessagePop() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch (err) {
      // Audio autoplay restrictions
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('pulsechat_sound', String(this.enabled));
    return this.enabled;
  }
}

const soundFx = new SoundFx();

// --- Default Channels ---
const DEFAULT_ROOMS = [
  { id: 'general', name: 'general', description: 'General chat and community discussions', icon: '💬' },
  { id: 'tech-talk', name: 'tech-talk', description: 'Code snippets, tech news, and architecture', icon: '💻' },
  { id: 'design', name: 'design', description: 'UI/UX inspiration, styling, and design feedback', icon: '🎨' },
  { id: 'random', name: 'random', description: 'Off-topic chat, memes, and fun', icon: '☕' }
];

// --- App State ---
const state = {
  currentUser: {
    uid: null,
    email: null,
    username: localStorage.getItem('pulsechat_username') || '',
    avatar: localStorage.getItem('pulsechat_avatar') || '⚡',
    status: 'online',
    room: 'general',
    isAuth: false
  },
  currentRoom: DEFAULT_ROOMS[0],
  rooms: [...DEFAULT_ROOMS],
  users: [],
  messages: [],
  replyTo: null,
  stagedAttachment: null,
  stagedCode: null,
  activeFloatingMessageId: null,
  isAtBottom: true,
  unreadWhileScrolled: 0,
  typingTimeout: null,
  isTyping: false,
  unsubscribeMessages: null,
  unsubscribeTyping: null,
  lastRenderedMessageCount: 0
};

// --- DOM Elements ---
const el = {
  joinModal: document.getElementById('joinModal'),
  authTabs: document.getElementById('authTabs'),
  tabGoogle: document.getElementById('tabGoogle'),
  tabEmail: document.getElementById('tabEmail'),
  tabGuest: document.getElementById('tabGuest'),
  authErrorBanner: document.getElementById('authErrorBanner'),
  authLoadingOverlay: document.getElementById('authLoadingOverlay'),
  authLoadingText: document.getElementById('authLoadingText'),

  googleSignInBtn: document.getElementById('googleSignInBtn'),
  googleRedirectSignInBtn: document.getElementById('googleRedirectSignInBtn'),
  googleRoomSelect: document.getElementById('googleRoomSelect'),

  emailAuthForm: document.getElementById('emailAuthForm'),
  emailNameGroup: document.getElementById('emailNameGroup'),
  emailDisplayNameInput: document.getElementById('emailDisplayNameInput'),
  emailInput: document.getElementById('emailInput'),
  passwordInput: document.getElementById('passwordInput'),
  emailRoomSelect: document.getElementById('emailRoomSelect'),
  emailSubmitBtn: document.getElementById('emailSubmitBtn'),
  emailSubmitBtnText: document.getElementById('emailSubmitBtnText'),
  toggleEmailModeLink: document.getElementById('toggleEmailModeLink'),
  authSwitchPrompt: document.getElementById('authSwitchPrompt'),

  guestJoinForm: document.getElementById('guestJoinForm'),
  avatarGrid: document.getElementById('avatarGrid'),
  guestUsernameInput: document.getElementById('guestUsernameInput'),
  guestRoomSelect: document.getElementById('guestRoomSelect'),

  appLayout: document.getElementById('appLayout'),
  sidebarLeft: document.getElementById('sidebarLeft'),
  sidebarRight: document.getElementById('sidebarRight'),

  channelList: document.getElementById('channelList'),
  openCreateRoomBtn: document.getElementById('openCreateRoomBtn'),
  createRoomModal: document.getElementById('createRoomModal'),
  createRoomForm: document.getElementById('createRoomForm'),
  newRoomName: document.getElementById('newRoomName'),
  newRoomDesc: document.getElementById('newRoomDesc'),
  roomIconPicker: document.getElementById('roomIconPicker'),
  closeCreateRoomModalBtn: document.getElementById('closeCreateRoomModalBtn'),
  cancelCreateRoomBtn: document.getElementById('cancelCreateRoomBtn'),

  currentRoomIcon: document.getElementById('currentRoomIcon'),
  currentRoomTitle: document.getElementById('currentRoomTitle'),
  currentRoomDesc: document.getElementById('currentRoomDesc'),
  detailRoomIcon: document.getElementById('detailRoomIcon'),
  detailRoomName: document.getElementById('detailRoomName'),
  detailRoomDesc: document.getElementById('detailRoomDesc'),

  myAvatarWrap: document.getElementById('myAvatarWrap'),
  myAvatar: document.getElementById('myAvatar'),
  myName: document.getElementById('myName'),
  myEmail: document.getElementById('myEmail'),
  myStatusDot: document.getElementById('myStatusDot'),
  userStatusSelect: document.getElementById('userStatusSelect'),
  signOutBtn: document.getElementById('signOutBtn'),

  messagesViewport: document.getElementById('messagesViewport'),
  messagesContainer: document.getElementById('messagesContainer'),
  roomWelcomeBanner: document.getElementById('roomWelcomeBanner'),
  welcomeIcon: document.getElementById('welcomeIcon'),
  welcomeTitle: document.getElementById('welcomeTitle'),
  welcomeText: document.getElementById('welcomeText'),
  scrollToBottomBtn: document.getElementById('scrollToBottomBtn'),
  messageSearchInput: document.getElementById('messageSearchInput'),

  typingIndicator: document.getElementById('typingIndicator'),
  typingText: document.getElementById('typingText'),

  chatForm: document.getElementById('chatForm'),
  messageTextInput: document.getElementById('messageTextInput'),
  replyPreviewBanner: document.getElementById('replyPreviewBanner'),
  replyTargetAuthor: document.getElementById('replyTargetAuthor'),
  replyTargetSnippet: document.getElementById('replyTargetSnippet'),
  cancelReplyBtn: document.getElementById('cancelReplyBtn'),

  stagedAttachmentBanner: document.getElementById('stagedAttachmentBanner'),
  stagedImagePreview: document.getElementById('stagedImagePreview'),
  stagedFileIcon: document.getElementById('stagedFileIcon'),
  stagedFileName: document.getElementById('stagedFileName'),
  stagedFileSize: document.getElementById('stagedFileSize'),
  cancelAttachmentBtn: document.getElementById('cancelAttachmentBtn'),
  fileAttachmentInput: document.getElementById('fileAttachmentInput'),
  attachmentBtn: document.getElementById('attachmentBtn'),

  stagedCodeBanner: document.getElementById('stagedCodeBanner'),
  stagedCodeLang: document.getElementById('stagedCodeLang'),
  cancelCodeBtn: document.getElementById('cancelCodeBtn'),
  codeSnippetModalBtn: document.getElementById('codeSnippetModalBtn'),
  codeSnippetModal: document.getElementById('codeSnippetModal'),
  codeSnippetForm: document.getElementById('codeSnippetForm'),
  codeSnippetLang: document.getElementById('codeSnippetLang'),
  codeSnippetContent: document.getElementById('codeSnippetContent'),
  closeCodeModalBtn: document.getElementById('closeCodeModalBtn'),
  cancelCodeModalBtn: document.getElementById('cancelCodeModalBtn'),

  emojiPickerBtn: document.getElementById('emojiPickerBtn'),
  emojiPickerDropdown: document.getElementById('emojiPickerDropdown'),
  emojiList: document.getElementById('emojiList'),

  floatingReactionPicker: document.getElementById('floatingReactionPicker'),

  imageLightboxModal: document.getElementById('imageLightboxModal'),
  lightboxImage: document.getElementById('lightboxImage'),
  lightboxCaption: document.getElementById('lightboxCaption'),
  closeLightboxBtn: document.getElementById('closeLightboxBtn'),

  membersList: document.getElementById('membersList'),
  memberCountBadge: document.getElementById('memberCountBadge'),
  memberCountText: document.getElementById('memberCountText'),

  toggleMobileSidebarBtn: document.getElementById('toggleMobileSidebarBtn'),
  toggleMembersBtn: document.getElementById('toggleMembersBtn'),
  closeRightSidebarBtn: document.getElementById('closeRightSidebarBtn'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  soundToggleBtn: document.getElementById('soundToggleBtn'),
  soundOnIcon: document.getElementById('soundOnIcon'),
  soundOffIcon: document.getElementById('soundOffIcon')
};

const EMOJI_SETS = {
  smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😎', '🥳', '🤩', '🤔', '🤫', '🤯', '😱', '🙌'],
  gestures: ['👍', '👎', '👏', '🤝', '✌️', '🤞', '👊', '👋', '🤘', '🙏', '💪', '👌', '🤙', '🔥', '✨', '💯', '💖', '❤️', '💔', '🎉'],
  objects: ['🚀', '💻', '📱', '💡', '⚡', '☕', '🍕', '🍔', '🍺', '🎮', '🎧', '🎨', '📚', '🔑', '💎', '📦', '🔔', '📌', '🛠️', '⚙️'],
  symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '⭐', '🌟', '💥', '💢', '❗', '❓', '💬', '👀', '🎯', '🏆', '🥇', '👑']
};

function renderAvatarHtml(avatar, fallback = '👤', username = '') {
  if (avatar && (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:image/'))) {
    return `<img class="avatar-img" src="${escapeHtml(avatar)}" alt="${escapeHtml(username)}" onerror="this.outerHTML='<span>${fallback}</span>'">`;
  }
  return `<span>${escapeHtml(avatar || fallback)}</span>`;
}

// --- Join & Presence ---
function connectAndJoinRoom(userData, targetRoomId = 'general') {
  state.currentUser.username = userData.username;
  state.currentUser.avatar = userData.avatar || '⚡';
  state.currentUser.email = userData.email || null;
  state.currentUser.uid = userData.uid || null;
  state.currentUser.isAuth = Boolean(userData.uid);

  localStorage.setItem('pulsechat_username', userData.username);
  localStorage.setItem('pulsechat_avatar', userData.avatar);

  updateUserProfileUI();
  el.joinModal.classList.add('hidden');
  hideLoading();
  clearAuthError();

  // Listen to custom rooms
  listenToCustomRooms((customRooms) => {
    const map = new Map();
    DEFAULT_ROOMS.forEach(r => map.set(r.id, r));
    customRooms.forEach(r => map.set(r.id, r));
    state.rooms = Array.from(map.values());
    renderChannelList();
  });

  // Listen to online users
  listenToOnlineUsers((onlineUsers) => {
    state.users = onlineUsers;
    renderMembersList();
  });

  // Switch to starting room
  switchRoom(targetRoomId);

  // Update presence in Firestore
  updateUserPresence(state.currentUser, true);
  window.addEventListener('beforeunload', () => {
    updateUserPresence(state.currentUser, false);
  });

  el.messageTextInput.focus();
}

// --- Room Switching with Real-Time Firestore Sync ---
function switchRoom(roomId) {
  const target = state.rooms.find(r => r.id === roomId) || DEFAULT_ROOMS[0];
  state.currentRoom = target;
  state.currentUser.room = target.id;

  renderCurrentRoomHeader();
  renderChannelList();

  // Clear typing for old room
  if (state.currentUser.username) {
    setFirestoreTyping(state.currentRoom.id, state.currentUser.username, false);
  }

  // Subscribe to real-time messages in this room
  if (state.unsubscribeMessages) state.unsubscribeMessages();
  state.lastRenderedMessageCount = 0;

  state.unsubscribeMessages = listenToRoomMessages(target.id, (messages) => {
    const isNewIncoming = messages.length > state.lastRenderedMessageCount && state.lastRenderedMessageCount > 0;
    const lastMsg = messages[messages.length - 1];

    state.messages = messages;
    renderAllMessages();
    state.lastRenderedMessageCount = messages.length;

    // Play chime if new incoming message from someone else
    if (isNewIncoming && lastMsg && lastMsg.sender && lastMsg.sender.username !== state.currentUser.username) {
      soundFx.playMessagePop();
    }

    if (state.isAtBottom) {
      scrollToBottom(false);
    } else {
      state.unreadWhileScrolled++;
      updateScrollPill();
    }
  });

  // Subscribe to typing indicators in this room
  if (state.unsubscribeTyping) state.unsubscribeTyping();
  state.unsubscribeTyping = listenToFirestoreTyping(target.id, state.currentUser.username, (typers) => {
    renderTypingIndicator(typers);
  });

  // Update presence room
  updateUserPresence(state.currentUser, true);
  scrollToBottom(true);
}

function renderTypingIndicator(typers) {
  if (!typers || typers.length === 0) {
    el.typingIndicator.classList.remove('active');
    el.typingText.textContent = '';
  } else {
    el.typingIndicator.classList.add('active');
    if (typers.length === 1) {
      el.typingText.textContent = `${typers[0]} is typing...`;
    } else if (typers.length === 2) {
      el.typingText.textContent = `${typers[0]} and ${typers[1]} are typing...`;
    } else {
      el.typingText.textContent = `${typers[0]} and ${typers.length - 1} others are typing...`;
    }
  }
}

// --- Loading & Error Helpers ---
function showAuthError(msg) {
  el.authErrorBanner.textContent = msg;
  el.authErrorBanner.classList.remove('hidden');
}

function clearAuthError() {
  el.authErrorBanner.textContent = '';
  el.authErrorBanner.classList.add('hidden');
}

function showLoading(text = 'Authenticating...') {
  el.authLoadingText.textContent = text;
  el.authLoadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  el.authLoadingOverlay.classList.add('hidden');
}

// --- Firebase Authentication Setup ---
function setupAuthFlow() {
  // Tab Switching
  el.authTabs.querySelectorAll('.auth-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      clearAuthError();
      el.authTabs.querySelectorAll('.auth-tab').forEach((b) => b.classList.remove('active'));
      tabBtn.classList.add('active');

      const target = tabBtn.dataset.tab;
      el.tabGoogle.classList.toggle('hidden', target !== 'google');
      el.tabEmail.classList.toggle('hidden', target !== 'email');
      el.tabGuest.classList.toggle('hidden', target !== 'guest');
    });
  });

  // Google Sign-In with Popup
  el.googleSignInBtn.addEventListener('click', async () => {
    clearAuthError();
    showLoading('Signing in with Google...');
    try {
      const user = await signInWithGoogle();
      const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'GoogleUser');
      const avatar = user.photoURL || '⚡';
      const targetRoom = el.googleRoomSelect.value || 'general';

      connectAndJoinRoom({
        username: displayName,
        avatar,
        email: user.email,
        uid: user.uid
      }, targetRoom);
    } catch (err) {
      hideLoading();
      console.error('Google Sign-In Error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        showAuthError('Popup closed. Ensure Google is enabled under Firebase Console > Sign-in method, or click "Safari / Redirect Sign-In" below.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        showAuthError('Sign-in cancelled. Only one popup can be active at a time.');
      } else if (err.code === 'auth/unauthorized-domain') {
        showAuthError('This domain is not authorized in Firebase Console -> Auth -> Settings -> Authorized domains.');
      } else {
        showAuthError(err.message || 'Failed to sign in with Google.');
      }
    }
  });

  // Google Sign-In with Redirect
  if (el.googleRedirectSignInBtn) {
    el.googleRedirectSignInBtn.addEventListener('click', async () => {
      clearAuthError();
      showLoading('Redirecting to Google...');
      try {
        await signInWithGoogleRedirect();
      } catch (err) {
        hideLoading();
        showAuthError(err.message || 'Redirect failed.');
      }
    });
  }

  // Email / Password Mode Toggle
  let isRegisterMode = false;
  el.toggleEmailModeLink.addEventListener('click', () => {
    clearAuthError();
    isRegisterMode = !isRegisterMode;
    if (isRegisterMode) {
      el.emailNameGroup.classList.remove('hidden');
      el.emailSubmitBtnText.textContent = 'Create PulseChat Account';
      el.authSwitchPrompt.textContent = 'Already have an account?';
      el.toggleEmailModeLink.textContent = 'Sign In';
    } else {
      el.emailNameGroup.classList.add('hidden');
      el.emailSubmitBtnText.textContent = 'Sign In with Email';
      el.authSwitchPrompt.textContent = 'Need an account?';
      el.toggleEmailModeLink.textContent = 'Create account';
    }
  });
  el.emailNameGroup.classList.add('hidden');

  // Email Auth Submit
  el.emailAuthForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthError();

    const email = el.emailInput.value.trim();
    const password = el.passwordInput.value;
    const targetRoom = el.emailRoomSelect.value || 'general';

    if (!email || !password) {
      showAuthError('Please enter both email and password.');
      return;
    }

    try {
      let user;
      if (isRegisterMode) {
        const displayName = el.emailDisplayNameInput.value.trim() || email.split('@')[0];
        showLoading('Creating your account...');
        user = await registerWithEmail(email, password, displayName);
      } else {
        showLoading('Signing in with Email...');
        user = await signInWithEmail(email, password);
      }

      const displayName = user.displayName || email.split('@')[0];
      const avatar = user.photoURL || '⚡';

      connectAndJoinRoom({
        username: displayName,
        avatar,
        email: user.email,
        uid: user.uid
      }, targetRoom);
    } catch (err) {
      hideLoading();
      console.error('Email Auth Error:', err);
      if (err.code === 'auth/email-already-in-use') {
        showAuthError('This email is already in use. Please sign in instead.');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        showAuthError('Invalid email or password.');
      } else if (err.code === 'auth/weak-password') {
        showAuthError('Password must be at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        showAuthError('Please enter a valid email address.');
      } else {
        showAuthError(err.message || 'Authentication failed.');
      }
    }
  });

  // Guest Form Submit
  let selectedGuestAvatar = '⚡';
  el.avatarGrid.querySelectorAll('.avatar-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      el.avatarGrid.querySelectorAll('.avatar-opt').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedGuestAvatar = btn.dataset.avatar;
    });
  });

  el.guestJoinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAuthError();

    const username = el.guestUsernameInput.value.trim();
    if (!username) return;

    const targetRoom = el.guestRoomSelect.value || 'general';

    connectAndJoinRoom({
      username,
      avatar: selectedGuestAvatar,
      email: null,
      uid: null
    }, targetRoom);
  });

  // Sign Out Handler
  el.signOutBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to sign out?')) {
      if (state.currentUser.username) {
        updateUserPresence(state.currentUser, false);
      }
      try {
        await logOut();
      } catch (err) {
        console.error('Logout error:', err);
      }

      state.currentUser = {
        uid: null,
        email: null,
        username: '',
        avatar: '⚡',
        status: 'online',
        room: 'general',
        isAuth: false
      };

      localStorage.removeItem('pulsechat_username');
      localStorage.removeItem('pulsechat_avatar');

      el.joinModal.classList.remove('hidden');
      el.messagesContainer.innerHTML = '';
      el.membersList.innerHTML = '';
    }
  });

  // Observe Firebase Auth State (Persistent Login)
  onAuthUserChanged((firebaseUser) => {
    if (firebaseUser) {
      const displayName = firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'User');
      const avatar = firebaseUser.photoURL || state.currentUser.avatar || '⚡';

      connectAndJoinRoom({
        username: displayName,
        avatar,
        email: firebaseUser.email,
        uid: firebaseUser.uid
      }, state.currentUser.room || 'general');
    }
  });

  // Check incoming redirect sign-in (Safari / mobile)
  checkRedirectResult().then((user) => {
    if (user) {
      const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
      const avatar = user.photoURL || '⚡';
      connectAndJoinRoom({
        username: displayName,
        avatar,
        email: user.email,
        uid: user.uid
      }, 'general');
    }
  }).catch((err) => {
    console.error('Redirect check error:', err);
  });
}

// --- UI Rendering Helpers ---
function updateUserProfileUI() {
  el.myAvatarWrap.innerHTML = `
    ${renderAvatarHtml(state.currentUser.avatar, '⚡', state.currentUser.username)}
    <span class="status-indicator ${state.currentUser.status || 'online'}" id="myStatusDot"></span>
  `;
  el.myStatusDot = document.getElementById('myStatusDot');
  el.myName.textContent = state.currentUser.username;
  if (el.myEmail) {
    el.myEmail.textContent = state.currentUser.email || (state.currentUser.isAuth ? '' : 'Guest');
  }
}

function renderChannelList() {
  el.channelList.innerHTML = '';
  state.rooms.forEach((room) => {
    const isActive = state.currentRoom && state.currentRoom.id === room.id;
    const item = document.createElement('div');
    item.className = `channel-item ${isActive ? 'active' : ''}`;
    item.innerHTML = `
      <div class="channel-item-left">
        <span class="channel-item-icon">${room.icon || '💬'}</span>
        <span>${escapeHtml(room.name)}</span>
      </div>
    `;

    item.addEventListener('click', () => {
      if (!isActive) {
        switchRoom(room.id);
        el.sidebarLeft.classList.remove('open');
      }
    });

    el.channelList.appendChild(item);
  });
}

function renderCurrentRoomHeader() {
  if (!state.currentRoom) return;

  el.currentRoomIcon.textContent = state.currentRoom.icon || '💬';
  el.currentRoomTitle.textContent = `#${state.currentRoom.name}`;
  el.currentRoomDesc.textContent = state.currentRoom.description || '';

  el.detailRoomIcon.textContent = state.currentRoom.icon || '💬';
  el.detailRoomName.textContent = `#${state.currentRoom.name}`;
  el.detailRoomDesc.textContent = state.currentRoom.description || '';

  el.welcomeIcon.textContent = state.currentRoom.icon || '💬';
  el.welcomeTitle.textContent = `Welcome to #${state.currentRoom.name}!`;
  el.welcomeText.textContent = state.currentRoom.description || `This is the start of #${state.currentRoom.name}.`;

  el.messageTextInput.placeholder = `Type a message in #${state.currentRoom.name}... (Enter to send, Shift+Enter for new line)`;
}

function renderMembersList() {
  // Filter for members in current room or all active
  const roomMembers = state.users.filter(u => !u.room || u.room === state.currentRoom.id);
  const displayList = roomMembers.length > 0 ? roomMembers : state.users;

  el.memberCountBadge.textContent = displayList.length;
  el.memberCountText.textContent = displayList.length;
  el.membersList.innerHTML = '';

  displayList.forEach((user) => {
    const isMe = (state.currentUser.uid && user.uid === state.currentUser.uid) || user.username === state.currentUser.username;
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `
      <div class="member-avatar-wrap">
        ${renderAvatarHtml(user.avatar, '👤', user.username)}
        <span class="status-indicator ${user.status || 'online'}"></span>
      </div>
      <div class="member-meta">
        <span class="member-name">${escapeHtml(user.username)}${isMe ? ' (You)' : ''}</span>
        <span class="member-status">${user.status || 'online'}</span>
      </div>
    `;

    row.addEventListener('click', () => {
      if (!isMe) {
        el.messageTextInput.value += ` @${user.username} `;
        el.messageTextInput.focus();
      }
    });

    el.membersList.appendChild(row);
  });
}

function renderAllMessages() {
  el.messagesContainer.innerHTML = '';
  state.messages.forEach((msg) => {
    appendMessageToUI(msg);
  });
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMarkdown(text) {
  let safe = escapeHtml(text);
  safe = safe.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>');
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
  safe = safe.replace(/\n/g, '<br>');
  return safe;
}

function appendMessageToUI(msg) {
  const isSelf = msg.sender && (
    (state.currentUser.uid && msg.sender.uid && msg.sender.uid === state.currentUser.uid) ||
    (state.currentUser.username && msg.sender.username === state.currentUser.username)
  );

  const row = document.createElement('div');
  row.className = `message-row ${isSelf ? 'is-outgoing' : 'is-incoming'}`;
  row.id = `msg-el-${msg.id}`;

  let replySnippetHtml = '';
  if (msg.replyTo) {
    replySnippetHtml = `
      <div class="message-reply-quote">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
        <span class="reply-quote-user">@${escapeHtml(msg.replyTo.author)}:</span>
        <span>${escapeHtml(msg.replyTo.snippet)}</span>
      </div>
    `;
  }

  let attachmentHtml = '';
  if (msg.attachment) {
    if (msg.attachment.type && msg.attachment.type.startsWith('image/')) {
      attachmentHtml = `
        <div class="message-attachment">
          <img class="attachment-image" src="${msg.attachment.data}" alt="${escapeHtml(msg.attachment.name)}" data-name="${escapeHtml(msg.attachment.name)}">
        </div>
      `;
    } else {
      attachmentHtml = `
        <div class="message-attachment">
          <a class="attachment-file-card" href="${msg.attachment.data}" download="${escapeHtml(msg.attachment.name)}">
            <span class="file-card-icon">📄</span>
            <div class="file-card-details">
              <span class="file-card-name">${escapeHtml(msg.attachment.name)}</span>
              <span class="file-card-size">${formatBytes(msg.attachment.size)}</span>
            </div>
          </a>
        </div>
      `;
    }
  }

  let codeHtml = '';
  if (msg.codeSnippet) {
    codeHtml = `
      <div class="message-code-block">
        <div class="code-block-header">
          <span>${escapeHtml(msg.codeSnippet.language || 'code')}</span>
          <button type="button" class="copy-code-btn" data-code="${encodeURIComponent(msg.codeSnippet.code)}">Copy</button>
        </div>
        <pre><code>${escapeHtml(msg.codeSnippet.code)}</code></pre>
      </div>
    `;
  }

  const reactionsHtml = renderReactionsMarkup(msg.id, msg.reactions);

  row.innerHTML = `
    <div class="message-avatar-wrap">
      ${renderAvatarHtml(msg.sender.avatar, '👤', msg.sender.username)}
    </div>
    <div class="message-content">
      ${replySnippetHtml}
      <div class="message-header">
        <span class="message-author ${isSelf ? 'is-self' : ''}">${isSelf ? 'You' : escapeHtml(msg.sender.username)}</span>
        <span class="message-time">${formatTime(msg.timestamp)}</span>
      </div>
      ${msg.text ? `<div class="message-text">${formatMarkdown(msg.text)}</div>` : ''}
      ${codeHtml}
      ${attachmentHtml}
      <div class="message-reactions" id="reactions-for-${msg.id}">
        ${reactionsHtml}
      </div>
    </div>
    <div class="message-actions">
      <button class="action-tool-btn msg-react-trigger" data-msgid="${msg.id}" title="Add Reaction">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
      </button>
      <button class="action-tool-btn msg-reply-trigger" data-msgid="${msg.id}" title="Reply">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
      </button>
      <button class="action-tool-btn msg-copy-trigger" data-msgid="${msg.id}" title="Copy Text">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
    </div>
  `;

  attachMessageRowEvents(row, msg);
  el.messagesContainer.appendChild(row);
}

function attachMessageRowEvents(row, msg) {
  const img = row.querySelector('.attachment-image');
  if (img) {
    img.addEventListener('click', () => {
      el.lightboxImage.src = img.src;
      el.lightboxCaption.textContent = img.dataset.name || 'Image';
      el.imageLightboxModal.classList.remove('hidden');
    });
  }

  const copyCodeBtn = row.querySelector('.copy-code-btn');
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', () => {
      const rawCode = decodeURIComponent(copyCodeBtn.dataset.code);
      navigator.clipboard.writeText(rawCode).then(() => {
        copyCodeBtn.textContent = 'Copied!';
        setTimeout(() => { copyCodeBtn.textContent = 'Copy'; }, 2000);
      });
    });
  }

  const reactBtn = row.querySelector('.msg-react-trigger');
  if (reactBtn) {
    reactBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openFloatingReactionPicker(msg.id, reactBtn);
    });
  }

  const replyBtn = row.querySelector('.msg-reply-trigger');
  if (replyBtn) {
    replyBtn.addEventListener('click', () => {
      stageReply(msg);
    });
  }

  const copyBtn = row.querySelector('.msg-copy-trigger');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const textToCopy = msg.text || (msg.codeSnippet ? msg.codeSnippet.code : '');
      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          const originalSvg = copyBtn.innerHTML;
          copyBtn.innerHTML = '✓';
          setTimeout(() => { copyBtn.innerHTML = originalSvg; }, 1500);
        });
      }
    });
  }
}

function renderReactionsMarkup(messageId, reactions) {
  if (!reactions || Object.keys(reactions).length === 0) return '';

  return Object.entries(reactions)
    .filter(([_, users]) => users && users.length > 0)
    .map(([emoji, users]) => {
      const reactedByMe = users.includes(state.currentUser.username);
      return `
        <button type="button" class="reaction-pill ${reactedByMe ? 'reacted-by-me' : ''}" data-msgid="${messageId}" data-emoji="${emoji}" title="${users.join(', ')}">
          <span>${emoji}</span>
          <span class="reaction-count">${users.length}</span>
        </button>
      `;
    })
    .join('');
}

function updateMessageReactionsUI(messageId, reactions) {
  const container = document.getElementById(`reactions-for-${messageId}`);
  if (container) {
    container.innerHTML = renderReactionsMarkup(messageId, reactions);
    container.querySelectorAll('.reaction-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        toggleReaction(messageId, pill.dataset.emoji);
      });
    });
  }
}

el.messagesContainer.addEventListener('click', (e) => {
  const pill = e.target.closest('.reaction-pill');
  if (pill) {
    const msgId = pill.dataset.msgid;
    const emoji = pill.dataset.emoji;
    toggleReaction(msgId, emoji);
  }
});

async function toggleReaction(messageId, emoji) {
  const msg = state.messages.find(m => m.id === messageId);
  if (!msg || !state.currentUser.username) return;

  const currentReactions = { ...(msg.reactions || {}) };
  if (!currentReactions[emoji]) {
    currentReactions[emoji] = [];
  }

  const idx = currentReactions[emoji].indexOf(state.currentUser.username);
  if (idx > -1) {
    currentReactions[emoji].splice(idx, 1);
    if (currentReactions[emoji].length === 0) {
      delete currentReactions[emoji];
    }
  } else {
    currentReactions[emoji].push(state.currentUser.username);
  }

  msg.reactions = currentReactions;
  updateMessageReactionsUI(messageId, currentReactions);

  try {
    await updateMessageReactionsInFirestore(state.currentRoom.id, messageId, currentReactions);
  } catch (err) {
    console.error('Failed to sync reaction to Firestore:', err);
  }
}

function openFloatingReactionPicker(messageId, anchorEl) {
  state.activeFloatingMessageId = messageId;
  const rect = anchorEl.getBoundingClientRect();
  el.floatingReactionPicker.style.top = `${rect.top - 44}px`;
  el.floatingReactionPicker.style.left = `${Math.min(window.innerWidth - 260, rect.left - 60)}px`;
  el.floatingReactionPicker.classList.remove('hidden');
}

el.floatingReactionPicker.querySelectorAll('.quick-react-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const emoji = btn.dataset.emoji;
    if (state.activeFloatingMessageId && emoji) {
      toggleReaction(state.activeFloatingMessageId, emoji);
    }
    el.floatingReactionPicker.classList.add('hidden');
  });
});

document.addEventListener('click', (e) => {
  if (!el.floatingReactionPicker.contains(e.target)) {
    el.floatingReactionPicker.classList.add('hidden');
  }
  if (!el.emojiPickerDropdown.contains(e.target) && !el.emojiPickerBtn.contains(e.target)) {
    el.emojiPickerDropdown.classList.add('hidden');
  }
});

// --- Reply System ---
function stageReply(msg) {
  state.replyTo = {
    messageId: msg.id,
    author: msg.sender.username,
    snippet: (msg.text || (msg.codeSnippet ? msg.codeSnippet.code : 'Attachment')).slice(0, 60)
  };

  el.replyTargetAuthor.textContent = state.replyTo.author;
  el.replyTargetSnippet.textContent = state.replyTo.snippet;
  el.replyPreviewBanner.classList.remove('hidden');
  el.messageTextInput.focus();
}

el.cancelReplyBtn.addEventListener('click', () => {
  state.replyTo = null;
  el.replyPreviewBanner.classList.add('hidden');
});

// --- Attachments & File Handling ---
el.attachmentBtn.addEventListener('click', () => {
  el.fileAttachmentInput.click();
});

el.fileAttachmentInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  stageFileAttachment(file);
});

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function stageFileAttachment(file) {
  if (file.size > 8 * 1024 * 1024) {
    alert('File size exceeds the 8MB limit.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    state.stagedAttachment = {
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      data: event.target.result
    };

    el.stagedFileName.textContent = file.name;
    el.stagedFileSize.textContent = formatBytes(file.size);

    if (file.type.startsWith('image/')) {
      el.stagedImagePreview.src = event.target.result;
      el.stagedImagePreview.classList.remove('hidden');
      el.stagedFileIcon.classList.add('hidden');
    } else {
      el.stagedFileIcon.classList.remove('hidden');
      el.stagedImagePreview.classList.add('hidden');
    }

    el.stagedAttachmentBanner.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

el.cancelAttachmentBtn.addEventListener('click', () => {
  state.stagedAttachment = null;
  el.fileAttachmentInput.value = '';
  el.stagedAttachmentBanner.classList.add('hidden');
});

el.messagesViewport.addEventListener('dragover', (e) => {
  e.preventDefault();
});

el.messagesViewport.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    stageFileAttachment(e.dataTransfer.files[0]);
  }
});

// --- Code Snippet System ---
el.codeSnippetModalBtn.addEventListener('click', () => {
  el.codeSnippetModal.classList.remove('hidden');
  el.codeSnippetContent.focus();
});

function closeCodeModal() {
  el.codeSnippetModal.classList.add('hidden');
}

el.closeCodeModalBtn.addEventListener('click', closeCodeModal);
el.cancelCodeModalBtn.addEventListener('click', closeCodeModal);

el.codeSnippetForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const code = el.codeSnippetContent.value.trim();
  const language = el.codeSnippetLang.value;
  if (!code) return;

  state.stagedCode = { language, code };
  el.stagedCodeLang.textContent = language;
  el.stagedCodeBanner.classList.remove('hidden');
  closeCodeModal();
  el.codeSnippetContent.value = '';
});

el.cancelCodeBtn.addEventListener('click', () => {
  state.stagedCode = null;
  el.stagedCodeBanner.classList.add('hidden');
});

// --- Emoji Picker ---
function populateEmojiPicker(category = 'smileys') {
  el.emojiList.innerHTML = '';
  const emojis = EMOJI_SETS[category] || EMOJI_SETS.smileys;
  emojis.forEach((emoji) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-item-btn';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      el.messageTextInput.value += emoji;
      el.messageTextInput.focus();
    });
    el.emojiList.appendChild(btn);
  });
}

el.emojiPickerBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  el.emojiPickerDropdown.classList.toggle('hidden');
  if (!el.emojiPickerDropdown.classList.contains('hidden')) {
    populateEmojiPicker('smileys');
  }
});

el.emojiPickerDropdown.querySelectorAll('.emoji-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    el.emojiPickerDropdown.querySelectorAll('.emoji-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    populateEmojiPicker(tab.dataset.cat);
  });
});

// --- Channel Creation Modal ---
el.openCreateRoomBtn.addEventListener('click', () => {
  el.createRoomModal.classList.remove('hidden');
  el.newRoomName.focus();
});

function closeCreateRoomModal() {
  el.createRoomModal.classList.add('hidden');
}

el.closeCreateRoomModalBtn.addEventListener('click', closeCreateRoomModal);
el.cancelCreateRoomBtn.addEventListener('click', closeCreateRoomModal);

let selectedRoomIcon = '💬';
el.roomIconPicker.querySelectorAll('.icon-opt').forEach((btn) => {
  btn.addEventListener('click', () => {
    el.roomIconPicker.querySelectorAll('.icon-opt').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedRoomIcon = btn.dataset.icon;
  });
});

el.createRoomForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = el.newRoomName.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const desc = el.newRoomDesc.value.trim();

  if (!name) return;

  const newRoom = {
    id: name,
    name,
    description: desc || 'Custom room',
    icon: selectedRoomIcon || '💬',
    createdAt: Date.now()
  };

  closeCreateRoomModal();
  el.newRoomName.value = '';
  el.newRoomDesc.value = '';

  try {
    await saveCustomRoom(newRoom);
    switchRoom(newRoom.id);
  } catch (err) {
    console.error('Failed to create custom room in Firestore:', err);
    if (!state.rooms.some(r => r.id === newRoom.id)) {
      state.rooms.push(newRoom);
      renderChannelList();
      switchRoom(newRoom.id);
    }
  }
});

// --- Message Sending & Textarea Handling ---
el.chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage();
});

el.messageTextInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

el.messageTextInput.addEventListener('input', () => {
  el.messageTextInput.style.height = 'auto';
  el.messageTextInput.style.height = `${Math.min(el.messageTextInput.scrollHeight, 120)}px`;
  handleTyping();
});

function handleTyping() {
  if (!state.currentUser.username) return;

  if (!state.isTyping) {
    state.isTyping = true;
    setFirestoreTyping(state.currentRoom.id, state.currentUser.username, true);
  }

  clearTimeout(state.typingTimeout);
  state.typingTimeout = setTimeout(() => {
    state.isTyping = false;
    setFirestoreTyping(state.currentRoom.id, state.currentUser.username, false);
  }, 2500);
}

async function sendMessage() {
  const text = el.messageTextInput.value.trim();
  const attachment = state.stagedAttachment;
  const codeSnippet = state.stagedCode;
  const replyTo = state.replyTo;

  if (!text && !attachment && !codeSnippet) return;

  el.messageTextInput.value = '';
  el.messageTextInput.style.height = 'auto';
  state.replyTo = null;
  el.replyPreviewBanner.classList.add('hidden');
  state.stagedAttachment = null;
  el.fileAttachmentInput.value = '';
  el.stagedAttachmentBanner.classList.add('hidden');
  state.stagedCode = null;
  el.stagedCodeBanner.classList.add('hidden');

  clearTimeout(state.typingTimeout);
  state.isTyping = false;
  if (state.currentUser.username) {
    setFirestoreTyping(state.currentRoom.id, state.currentUser.username, false);
  }

  try {
    await sendMessageToFirestore(state.currentRoom.id, {
      text,
      sender: {
        username: state.currentUser.username || 'Anonymous',
        avatar: state.currentUser.avatar || '⚡',
        email: state.currentUser.email || null,
        uid: state.currentUser.uid || null
      },
      replyTo,
      attachment,
      codeSnippet
    });
    scrollToBottom(true);
  } catch (err) {
    console.error('Error sending message to Firestore:', err);
    alert('Failed to send message: ' + (err.message || 'Firestore error'));
  }
}

// --- Scroll Management ---
function scrollToBottom(smooth = true) {
  el.messagesViewport.scrollTo({
    top: el.messagesViewport.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  });
  state.isAtBottom = true;
  state.unreadWhileScrolled = 0;
  updateScrollPill();
}

el.messagesViewport.addEventListener('scroll', () => {
  const threshold = 60;
  const current = el.messagesViewport.scrollTop + el.messagesViewport.clientHeight;
  state.isAtBottom = current >= el.messagesViewport.scrollHeight - threshold;

  if (state.isAtBottom) {
    state.unreadWhileScrolled = 0;
  }
  updateScrollPill();
});

function updateScrollPill() {
  if (!state.isAtBottom && state.unreadWhileScrolled > 0) {
    el.scrollToBottomBtn.classList.remove('hidden');
    el.scrollToBottomBtn.querySelector('span').textContent = `${state.unreadWhileScrolled} new message${state.unreadWhileScrolled > 1 ? 's' : ''}`;
  } else {
    el.scrollToBottomBtn.classList.add('hidden');
  }
}

el.scrollToBottomBtn.addEventListener('click', () => {
  scrollToBottom(true);
});

// --- Search Messages ---
el.messageSearchInput.addEventListener('input', (e) => {
  const query = e.target.value.trim().toLowerCase();
  const rows = el.messagesContainer.querySelectorAll('.message-row');

  rows.forEach((row) => {
    if (!query) {
      row.classList.remove('hidden');
    } else {
      const text = row.textContent.toLowerCase();
      row.classList.toggle('hidden', !text.includes(query));
    }
  });
});

// --- Status Selector ---
el.userStatusSelect.addEventListener('change', (e) => {
  const status = e.target.value;
  state.currentUser.status = status;
  if (el.myStatusDot) {
    el.myStatusDot.className = `status-indicator ${status}`;
  }
  updateUserPresence(state.currentUser, true);
});

// --- Theme Toggle ---
function setupTheme() {
  const savedTheme = localStorage.getItem('pulsechat_theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.remove('theme-dark');
  } else {
    document.body.classList.add('theme-dark');
  }

  el.themeToggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('theme-dark');
    localStorage.setItem('pulsechat_theme', isDark ? 'dark' : 'light');
  });
}

// --- Sound Toggle ---
function setupSoundToggle() {
  updateSoundIcons();
  el.soundToggleBtn.addEventListener('click', () => {
    soundFx.toggle();
    updateSoundIcons();
  });
}

function updateSoundIcons() {
  if (soundFx.enabled) {
    el.soundOnIcon.classList.remove('hidden');
    el.soundOffIcon.classList.add('hidden');
  } else {
    el.soundOnIcon.classList.add('hidden');
    el.soundOffIcon.classList.remove('hidden');
  }
}

// --- Lightbox Close ---
el.closeLightboxBtn.addEventListener('click', () => {
  el.imageLightboxModal.classList.add('hidden');
});

el.imageLightboxModal.addEventListener('click', (e) => {
  if (e.target === el.imageLightboxModal) {
    el.imageLightboxModal.classList.add('hidden');
  }
});

// --- Mobile Navigation ---
el.toggleMobileSidebarBtn.addEventListener('click', () => {
  el.sidebarLeft.classList.toggle('open');
});

el.toggleMembersBtn.addEventListener('click', () => {
  el.sidebarRight.classList.toggle('open');
});

el.closeRightSidebarBtn.addEventListener('click', () => {
  el.sidebarRight.classList.remove('open');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    el.imageLightboxModal.classList.add('hidden');
    closeCreateRoomModal();
    closeCodeModal();
    el.floatingReactionPicker.classList.add('hidden');
    el.emojiPickerDropdown.classList.add('hidden');
  }
});

// --- Start Up ---
setupTheme();
setupSoundToggle();
setupAuthFlow();
