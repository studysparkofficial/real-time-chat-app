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

## AWS S3 media storage

Images, MP4/WebM videos, and PDFs upload directly from the browser to a private S3 bucket using short-lived presigned URLs. Firestore stores only the S3 key and media metadata. The browser-side API client is `public/attachment-service.js`; it expects authenticated `POST /upload-url` and `POST /download-url` routes at its configured API Gateway URL. The API must verify Firebase ID tokens, enforce the 50 MB and MIME-type limits, and generate signed S3 URLs. For downloads, it should also verify that the requested key belongs to the supplied room/message before signing it. Keep AWS access keys on the API/Lambda side, never in the browser.

Configure API Gateway CORS for the local and Amplify origins, allowing `POST`/`OPTIONS` and the `Authorization` and `Content-Type` headers. Configure S3 CORS for those origins and allow `PUT`/`POST` as required by the presigned upload response. Add the Amplify domain to Firebase Authentication's authorized domains so users can get the token required by the media API.

## Deploy to AWS Amplify

The root `amplify.yml` tells Amplify to publish the static files from `public/`; there is no frontend compile step. Push that file to the connected branch to trigger a new deployment. Amplify Hosting serves the client files; Firebase handles chat data and authentication, while the API Gateway/Lambda service handles S3 access.

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
    ├── firebase-config.js   # Firebase setup and data operations
    └── attachment-service.js # S3 upload/download API client
```
