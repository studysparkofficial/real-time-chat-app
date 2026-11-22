# PulseChat ⚡

JNUverse is a responsive real-time chat app. Vite serves the React client; Firebase Authentication and Cloud Firestore provide sign-in and shared chat data.

## Features

- Google, email/password, and guest entry
- Live messages, channels, members, and typing indicators
- Searchable one-to-one direct messages with recent chats and unread indicators
- Reactions, replies, code snippets, and file/image attachments
- Dark/light themes, offline message queuing, and responsive mobile navigation

## Run locally

### Requirements

Install Node.js 18 or newer.

### Start

From the project directory:

```bash
npm install
npm run dev
```

Open the URL printed in the terminal. Vite uses `http://localhost:3000` by default.

## Firebase setup

The React app uses the Firebase project configured in `src/services/firebase.ts`. Enable Google, Email/Password, and Anonymous providers as needed, and add `localhost` to Firebase Authentication's authorized domains.

Create a Firestore database and configure security rules for the sign-in methods you want to support. Guest entry uses Firebase Anonymous Authentication. Firebase Console settings and security rules are separate from running the local development server.

## Direct messages

Direct chats use `rooms/dm_*/messages`, with a participant list on the parent conversation document. The included rules restrict those messages and typing indicators to the two participants; read state is stored per user. Deploy the rules and conversation index with `firebase deploy --only firestore:rules,firestore:indexes`. Member search profiles are created when users sign in, so existing members appear after they next open the app.

These rules provide access control within JNUverse; they do not provide WhatsApp-style end-to-end encryption. If the S3 download API is enabled for direct-message attachments, its signer must also verify the requester is listed in the conversation participants before issuing a download URL. The API uses privileged access and does not inherit Firestore client rules.

## AWS S3 media storage

Images, MP4/WebM videos, and PDFs upload directly from the browser to a private S3 bucket using short-lived presigned URLs. Firestore stores only the S3 key and media metadata. The browser-side API client is `src/services/s3Service.ts`; it expects authenticated `POST /upload-url` and `POST /download-url` routes at its configured API Gateway URL. The API must verify Firebase ID tokens, enforce the 50 MB and MIME-type limits, and generate signed S3 URLs. For downloads, it should also verify that the requested key belongs to the supplied room/message before signing it. For direct-message media, it must verify that the requester is one of that conversation's participants. Keep AWS access keys on the API/Lambda side, never in the browser.

Configure API Gateway CORS for the local and Amplify origins, allowing `POST`/`OPTIONS` and the `Authorization` and `Content-Type` headers. Configure S3 CORS for those origins and allow `PUT`/`POST` as required by the presigned upload response. Add the Amplify domain to Firebase Authentication's authorized domains so users can get the token required by the media API.

## Deploy to AWS Amplify

The root `amplify.yml` runs `npm ci` and `npm run build`, then publishes `dist/`. Push that file to the connected branch to trigger a new deployment. Amplify Hosting serves the built client; Firebase handles chat data and authentication, while the API Gateway/Lambda service handles S3 access.

## Try multi-user chat

Open the local URL in two browser tabs, sign in as different users, and send messages in a shared channel or start a direct chat. Messages and channel data are shared through Firestore.

## Project structure

```text
real-time-chat-app/
├── package.json
├── index.html
├── vite.config.ts
├── firestore.rules
├── firestore.indexes.json
├── README.md
├── src/
│   ├── App.tsx
│   ├── hooks/               # Auth, messages, presence, direct chats
│   ├── components/          # Chat UI, sidebar, and dialogs
│   └── services/            # Firebase, S3, cache, and message helpers
└── public/                  # App icons, manifest, and service worker
```
