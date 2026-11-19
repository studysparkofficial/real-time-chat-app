# PulseChat ⚡

PulseChat is a responsive real-time chat app. Express serves the web client; Firebase Authentication and Cloud Firestore provide sign-in and shared chat data.

## Features

- Google, email/password, and guest entry
- Live messages, channels, members, and typing indicators
- Reactions, replies, code snippets, and file/image attachments
- Search, dark/light themes, and responsive mobile navigation

## Run locally

### Requirements

Install Node.js 18 or newer.

### Start

From the project directory:

```bash
npm install
npm start
```

Open the URL printed in the terminal. The default is `http://localhost:3000`. If that port is occupied, the server tries the next available port and prints its URL.

## Firebase setup

The browser uses the Firebase project configured in `public/firebase-config.js`. To use account sign-in, enable Google and Email/Password in Firebase Authentication and add `localhost` to the authorized domains.

Create a Firestore database and configure security rules for the sign-in methods you want to support. Guest entry tries Firebase Anonymous Authentication first; enable the Anonymous provider to use rules that require a signed-in user. If Anonymous is disabled, the app falls back to an unauthenticated guest, which only works when your Firestore rules allow guest writes. Firebase Console settings and security rules are separate from running the local Node server.

Attachments are embedded in Firestore message documents and are limited to 700 KB.

## Try multi-user chat

Open the printed local URL in two browser tabs, join the same channel with different display names, and send messages. Messages and channel data are shared through Firestore.

## Project structure

```text
real-time-chat-app/
├── package.json
├── server.js               # Express static server and Socket.IO server
├── README.md
└── public/
    ├── index.html
    ├── style.css
    ├── app.js               # Browser UI and Firestore client
    └── firebase-config.js   # Firebase setup and data operations
```
