# PulseChat ⚡ — Modern Real-Time Chat Application

PulseChat is a full-featured, responsive, production-ready real-time chat application built with **Node.js**, **Express**, **Socket.IO**, and modern **HTML5/CSS3/Vanilla JavaScript**.

---

## ✨ Features

- 💬 **Real-Time Messaging**: Instant message delivery with WebSocket communication via Socket.IO.
- 🔥 **Firebase Authentication**:
  - **Google Sign-In**: One-click sign-in using your Google/Gmail account (`signInWithPopup`). Automatically imports your Google profile photo and display name.
  - **Email & Password**: Sign up or log in with any email (including Gmail) and password.
  - **Guest / Demo Mode**: Instant access with customizable emoji avatars for offline/quick testing without an account.
  - **Persistent Session**: Automatic session recovery via Firebase `onAuthStateChanged`.
  - **Sign Out**: Clean logout to switch between accounts.
- 🏷️ **Multi-Channel Support**: Pre-configured channels (`#general`, `#tech-talk`, `#design`, `#random`) plus the ability to create custom channels with custom icons and descriptions on the fly.
- 👤 **Custom User Profiles**: Pick from 10+ expressive avatars, customize display name, and set live availability status (🟢 *Online*, 🟡 *Away*, 🔴 *Busy*).
- 👥 **Live Online Member List**: See active users per channel in real time with status dots and click-to-mention `@username` support.
- ⌨️ **Live Typing Indicators**: Animated typing dots and notification ("*Alice is typing...*") when users are composing messages.
- ❤️ **Message Reactions**: Quick emoji reactions (👍, ❤️, 😂, 🔥, 🚀, 🎉, 👏) with live counters and toggle support.
- 📎 **Rich Attachments**:
  - Image sharing with instant inline previews and zoomable full-screen **Lightbox**.
  - File attachments (PDF, TXT, JSON, code files) with file size and download badges.
  - Drag-and-drop file upload support directly onto the chat viewport.
- 💻 **Code Snippet Sharing**: Dedicated code snippet modal with language tag selector, formatted mono code blocks, and one-click **Copy Code** button.
- 💬 **Message Replies & Quoting**: Reply to specific messages with quote previews.
- 🔔 **Web Audio Chimes**: Gentle synthesized audio notifications using the standard Web Audio API (no external sound files required) with instant mute/unmute toggle.
- 🔍 **Instant In-Channel Search**: Filter message history by keyword in real time.
- 🌓 **Dark & Light Mode**: Sleek glassmorphic theme with persistent preferences stored in `localStorage`.
- 📱 **Fully Responsive**: Mobile drawer navigation with responsive sidebars for phones, tablets, and desktops.
- 📜 **Smart Auto-Scroll**: Smooth scrolling with a floating "New messages ↓" pill when reading earlier history.

---

## 🚀 Quick Start

### 1. Prerequisites
Ensure [Node.js](https://nodejs.org/) (v16 or higher) is installed on your system.

### 2. Install Dependencies
Dependencies (`express` and `socket.io`) are already defined in `package.json`:
```bash
npm install
```

### 3. Start the Server
```bash
npm start
```
The application will launch at:
```
http://localhost:3000
```

---

## 👥 Testing Real-Time Multi-User Interaction

1. Open `http://localhost:3000` in your primary browser window.
2. Enter a display name (e.g., `Alex`) and pick an avatar (e.g. ⚡).
3. Open a **second tab** or an **Incognito / Private window** at `http://localhost:3000`.
4. Enter another display name (e.g., `Maria`) and pick an avatar (e.g. 🚀).
5. Join the same channel (e.g., `#general`) or switch to `#tech-talk`.
6. Watch messages, typing notifications, attachments, and emoji reactions sync instantly across both screens!

---

## 📂 Project Structure

```
real-time-chat-app/
├── package.json         # Project metadata and dependencies
├── server.js            # Node.js + Express + Socket.IO backend
├── README.md            # Project documentation
└── public/              # Client-side static assets
    ├── index.html       # Semantic HTML layout and modals
    ├── style.css        # CSS variables, glassmorphism, responsive design
    └── app.js           # Socket.IO client, Web Audio chimes, UI controller
```

---

## 🛠️ API & Socket Events Reference

| Event Name | Direction | Payload | Description |
|---|---|---|---|
| `join_room` | Client ➔ Server | `{ username, avatar, room }` | Connect user to room |
| `switch_room` | Client ➔ Server | `roomId` | Move user between channels |
| `create_room` | Client ➔ Server | `{ name, description, icon }` | Dynamically create new channel |
| `chat_message` | Client ➔ Server | `{ text, attachment, codeSnippet, replyTo }` | Send message |
| `typing` | Client ➔ Server | `{ isTyping: boolean }` | Emit typing status |
| `message_reaction` | Client ➔ Server | `{ messageId, emoji }` | Toggle message reaction |
| `update_status` | Client ➔ Server | `'online' \| 'away' \| 'busy'` | Update availability status |
| `new_message` | Server ➔ Client | Message Object | Broadcast incoming message |
| `room_users` | Server ➔ Client | Array of active users | Sync online room member list |
| `users_typing` | Server ➔ Client | Array of usernames | Sync live typing indicators |
