import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { Server } from 'socket.io';
import { createCallRouter } from './backend/callRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e7 // 10MB limit for file/image uploads
});

// Mount Chime SDK calling API router
app.use('/api/calls', createCallRouter());

const DEFAULT_PORT = 3001;
const PORT = Number(process.env.PORT) || DEFAULT_PORT;
let activePort = PORT;

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// In-memory state
const rooms = {
  'general': {
    id: 'general',
    name: 'general',
    description: 'Welcome to the general room! Say hi to everyone.',
    icon: '💬',
    createdAt: Date.now()
  },
  'tech-talk': {
    id: 'tech-talk',
    name: 'tech-talk',
    description: 'Code snippets, tech news, and architecture discussions.',
    icon: '💻',
    createdAt: Date.now()
  },
  'design': {
    id: 'design',
    name: 'design',
    description: 'UI/UX designs, feedback, and creative inspiration.',
    icon: '🎨',
    createdAt: Date.now()
  },
  'random': {
    id: 'random',
    name: 'random',
    description: 'Memes, off-topic chat, and watercooler fun.',
    icon: '☕',
    createdAt: Date.now()
  }
};

// Store message history per room (max 150 per room)
const roomMessages = {
  'general': [],
  'tech-talk': [],
  'design': [],
  'random': []
};

// Map socket.id -> user info { id, username, avatar, room, status }
const activeUsers = new Map();

// Map user.uid -> Set of socket.id for direct call signaling
const userSockets = new Map();

// Typing users per room: room -> Set of usernames
const typingUsers = new Map();

// Helper to get users in a room
function getRoomUsers(roomId) {
  const users = [];
  for (const user of activeUsers.values()) {
    if (user.room === roomId) {
      users.push({
        id: user.id,
        uid: user.uid || null,
        email: user.email || null,
        username: user.username,
        avatar: user.avatar,
        status: user.status || 'online'
      });
    }
  }
  return users;
}

// Add system message to room
function addSystemMessage(roomId, text) {
  const sysMsg = {
    id: `sys_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    isSystem: true,
    text,
    roomId,
    timestamp: Date.now()
  };

  if (!roomMessages[roomId]) {
    roomMessages[roomId] = [];
  }
  roomMessages[roomId].push(sysMsg);
  if (roomMessages[roomId].length > 150) {
    roomMessages[roomId].shift();
  }
  return sysMsg;
}

io.on('connection', (socket) => {
  // 1. User joins with profile and room
  socket.on('join_room', ({ username, avatar, room, uid, email }) => {
    const targetRoom = rooms[room] ? room : 'general';
    const cleanUsername = String(username || 'Anonymous').trim().slice(0, 35) || 'Anonymous';
    const cleanAvatar = String(avatar || '👤').slice(0, 1000);

    // If socket was in another room, leave it first
    const prevUser = activeUsers.get(socket.id);
    if (prevUser && prevUser.room) {
      socket.leave(prevUser.room);
      const leaveSysMsg = addSystemMessage(prevUser.room, `${prevUser.username} left the room`);
      io.to(prevUser.room).emit('new_message', leaveSysMsg);
      io.to(prevUser.room).emit('room_users', getRoomUsers(prevUser.room));
    }

    // Join new room
    socket.join(targetRoom);
    activeUsers.set(socket.id, {
      id: socket.id,
      uid: uid || null,
      email: email || null,
      username: cleanUsername,
      avatar: cleanAvatar,
      room: targetRoom,
      status: 'online'
    });

    // Send room metadata, list of rooms, and recent message history
    socket.emit('joined_room_success', {
      room: rooms[targetRoom],
      rooms: Object.values(rooms),
      history: roomMessages[targetRoom] || [],
      currentUser: {
        id: socket.id,
        uid: uid || null,
        email: email || null,
        username: cleanUsername,
        avatar: cleanAvatar,
        room: targetRoom
      }
    });

    // Notify room of new user
    const joinSysMsg = addSystemMessage(targetRoom, `${cleanUsername} joined #${targetRoom}`);
    io.to(targetRoom).emit('new_message', joinSysMsg);
    io.to(targetRoom).emit('room_users', getRoomUsers(targetRoom));
  });

  // 2. Switch Room
  socket.on('switch_room', (newRoomId) => {
    const user = activeUsers.get(socket.id);
    if (!user || !rooms[newRoomId] || user.room === newRoomId) return;

    const oldRoom = user.room;
    socket.leave(oldRoom);

    // Clear typing state in old room
    if (typingUsers.has(oldRoom)) {
      typingUsers.get(oldRoom).delete(user.username);
      io.to(oldRoom).emit('users_typing', Array.from(typingUsers.get(oldRoom)));
    }

    const leaveSysMsg = addSystemMessage(oldRoom, `${user.username} left the room`);
    io.to(oldRoom).emit('new_message', leaveSysMsg);
    io.to(oldRoom).emit('room_users', getRoomUsers(oldRoom));

    // Join new room
    socket.join(newRoomId);
    user.room = newRoomId;

    socket.emit('room_switched', {
      room: rooms[newRoomId],
      history: roomMessages[newRoomId] || []
    });

    const joinSysMsg = addSystemMessage(newRoomId, `${user.username} joined #${newRoomId}`);
    io.to(newRoomId).emit('new_message', joinSysMsg);
    io.to(newRoomId).emit('room_users', getRoomUsers(newRoomId));
  });

  // 3. Create a new custom channel
  socket.on('create_room', ({ name, description, icon }) => {
    const cleanId = String(name || '').toLowerCase().trim().replace(/[^a-z0-9-_]/g, '-').slice(0, 20);
    if (!cleanId || rooms[cleanId]) {
      socket.emit('error_message', 'Channel name already exists or is invalid.');
      return;
    }

    const newRoom = {
      id: cleanId,
      name: cleanId,
      description: String(description || 'User created room').trim().slice(0, 100),
      icon: String(icon || '💬').slice(0, 10),
      createdAt: Date.now()
    };

    rooms[cleanId] = newRoom;
    roomMessages[cleanId] = [];

    // Broadcast updated rooms list to all clients
    io.emit('rooms_updated', Object.values(rooms));
    socket.emit('room_created', newRoom);
  });

  // 4. Send chat message
  socket.on('chat_message', ({ text, replyTo, attachment, codeSnippet }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const cleanText = String(text || '').trim();
    if (!cleanText && !attachment && !codeSnippet) return;

    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      roomId: user.room,
      sender: {
        id: socket.id,
        uid: user.uid || null,
        email: user.email || null,
        username: user.username,
        avatar: user.avatar
      },
      text: cleanText,
      replyTo: replyTo || null,
      attachment: attachment || null, // { name, type, data, size }
      codeSnippet: codeSnippet || null, // { language, code }
      reactions: {}, // emoji -> [usernames]
      timestamp: Date.now()
    };

    if (!roomMessages[user.room]) {
      roomMessages[user.room] = [];
    }
    roomMessages[user.room].push(message);
    if (roomMessages[user.room].length > 150) {
      roomMessages[user.room].shift();
    }

    // Stop typing immediately when sending message
    if (typingUsers.has(user.room)) {
      typingUsers.get(user.room).delete(user.username);
      io.to(user.room).emit('users_typing', Array.from(typingUsers.get(user.room)));
    }

    io.to(user.room).emit('new_message', message);
  });

  // 5. Message reaction (add or remove)
  socket.on('message_reaction', ({ messageId, emoji }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !emoji) return;

    const messages = roomMessages[user.room];
    if (!messages) return;

    const targetMsg = messages.find((m) => m.id === messageId);
    if (!targetMsg) return;

    if (!targetMsg.reactions) {
      targetMsg.reactions = {};
    }

    if (!targetMsg.reactions[emoji]) {
      targetMsg.reactions[emoji] = [];
    }

    const index = targetMsg.reactions[emoji].indexOf(user.username);
    if (index > -1) {
      // User already reacted: remove reaction
      targetMsg.reactions[emoji].splice(index, 1);
      if (targetMsg.reactions[emoji].length === 0) {
        delete targetMsg.reactions[emoji];
      }
    } else {
      // Add reaction
      targetMsg.reactions[emoji].push(user.username);
    }

    io.to(user.room).emit('message_reaction_updated', {
      messageId,
      reactions: targetMsg.reactions
    });
  });

  // 6. Typing indicators
  socket.on('typing', ({ isTyping }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const room = user.room;
    if (!typingUsers.has(room)) {
      typingUsers.set(room, new Set());
    }

    const currentTypers = typingUsers.get(room);
    if (isTyping) {
      currentTypers.add(user.username);
    } else {
      currentTypers.delete(user.username);
    }

    socket.to(room).emit('users_typing', Array.from(currentTypers));
  });

  // 7. Status update (online / away / busy)
  socket.on('update_status', (newStatus) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const allowed = ['online', 'away', 'busy'];
    if (allowed.includes(newStatus)) {
      user.status = newStatus;
      io.to(user.room).emit('room_users', getRoomUsers(user.room));
    }
  });

  // 8. Call Signaling Events (One-to-one voice & video)
  socket.on('register_user', ({ uid }) => {
    if (!uid) return;
    socket.userId = uid;
    if (!userSockets.has(uid)) {
      userSockets.set(uid, new Set());
    }
    userSockets.get(uid).add(socket.id);
  });

  socket.on('call:initiate', ({ toUid, callSession }) => {
    if (!toUid) return;
    const targets = userSockets.get(toUid);
    if (targets && targets.size > 0) {
      targets.forEach((sockId) => {
        io.to(sockId).emit('call:incoming', callSession);
      });
    }
  });

  socket.on('call:ringing', ({ toUid, callId }) => {
    if (!toUid) return;
    const targets = userSockets.get(toUid);
    if (targets) {
      targets.forEach((sockId) => io.to(sockId).emit('call:ringing', { callId }));
    }
  });

  socket.on('call:accept', ({ toUid, callId }) => {
    if (!toUid) return;
    const targets = userSockets.get(toUid);
    if (targets) {
      targets.forEach((sockId) => io.to(sockId).emit('call:accepted', { callId }));
    }
  });

  socket.on('call:reject', ({ toUid, callId, reason }) => {
    if (!toUid) return;
    const targets = userSockets.get(toUid);
    if (targets) {
      targets.forEach((sockId) => io.to(sockId).emit('call:rejected', { callId, reason }));
    }
  });

  socket.on('call:busy', ({ toUid, callId }) => {
    if (!toUid) return;
    const targets = userSockets.get(toUid);
    if (targets) {
      targets.forEach((sockId) => io.to(sockId).emit('call:busy', { callId }));
    }
  });

  socket.on('call:end', ({ toUid, callId }) => {
    if (!toUid) return;
    const targets = userSockets.get(toUid);
    if (targets) {
      targets.forEach((sockId) => io.to(sockId).emit('call:ended', { callId }));
    }
  });

  // 9. Disconnect
  socket.on('disconnect', () => {
    if (socket.userId && userSockets.has(socket.userId)) {
      userSockets.get(socket.userId).delete(socket.id);
      if (userSockets.get(socket.userId).size === 0) {
        userSockets.delete(socket.userId);
      }
    }

    const user = activeUsers.get(socket.id);
    if (user) {
      const room = user.room;
      activeUsers.delete(socket.id);

      if (typingUsers.has(room)) {
        typingUsers.get(room).delete(user.username);
        io.to(room).emit('users_typing', Array.from(typingUsers.get(room)));
      }

      const leaveSysMsg = addSystemMessage(room, `${user.username} disconnected`);
      io.to(room).emit('new_message', leaveSysMsg);
      io.to(room).emit('room_users', getRoomUsers(room));
    }
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && !process.env.PORT && activePort < DEFAULT_PORT + 10) {
    activePort += 1;
    console.warn(`Port ${activePort - 1} is already in use. Trying port ${activePort}...`);
    server.listen(activePort);
    return;
  }

  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${activePort} is already in use. Stop the other server or run with PORT=3001 npm start.`);
  } else {
    console.error('Unable to start the chat server:', error.message);
  }
  process.exitCode = 1;
});

server.listen(PORT, () => {
  console.log(`🚀 Real-Time Chat Server running at http://localhost:${activePort}`);
});
