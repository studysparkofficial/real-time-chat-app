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

Install Node.js 18 or newer for the web app. Cloud Functions deploy on Node.js 22; use Node.js 22 when installing or running the Functions package locally.

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

## Notifications

The notification system uses the app's existing Cloud Firestore database. Firestore listeners keep the bell and notification center current across a user's signed-in devices. Second-generation Firebase Cloud Functions create recipient notifications from message, reaction, call, and first-browser-session events. The service worker handles background Web Push and notification clicks. This adds no AWS notification service; AWS remains used for the existing Chime calling and S3 media paths.

### Events supported by the current app

- Direct messages, replies, mentions selected from the message composer, attachments, and reactions to a user's own messages.
- Public channel mentions/replies, plus regular channel messages for users who opt in. Channel-wide alerts are off by default because these channels have no membership list.
- Incoming voice/video calls, missed calls, and rejected/busy/failed call updates. A terminal call update clears its active incoming-call browser alert.
- A notification when a browser signs in to an account for the first time. This is a new-session notice; it is not a suspicious-login detector.

The settings UI also includes group announcement, status, and system/security categories so their preferences have a home. The current project does not have status posts, private group membership/invitations/announcements, group calls, or an admin system-announcement event source, so those categories do not produce events yet. Forwarding is also not a current message feature. Add those event models before enabling their notification sources.

### Firestore data model

- `user_private/{uid}/notifications/{notificationId}` — trusted server-created notification record with type/category, sender, related room/message/call, title/body, aggregation count, read state, delivery status, and 90-day expiry.
- `user_private/{uid}/notification_events/{eventId}` — server-only idempotency and push retry marker, expiring after 30 days.
- `user_private/{uid}/notification_settings/preferences` — the user's category preferences, sound/preview options, push setting, and quiet-hours window/time zone.
- `user_private/{uid}/muted_rooms/{roomId}` — per-chat/channel mute state.
- `user_private/{uid}/push_subscriptions/{subscriptionId}` — private browser endpoint and encryption keys; callable functions only can access it; at most 10 devices per account.
- `user_private/{uid}/security_sessions/{deviceId}` — a private first-seen browser marker for account session notices.

Clients can read their own notifications, mark them read, and delete them. Firestore rules deny client creation of notifications and client access to push credentials, dedupe markers, and session records. Cloud Functions use the Admin SDK to write trusted notification events. Fast repeated messages from the same sender and conversation are combined into a five-minute inbox item; push alerts reuse a conversation tag. Message previews are off by default.

### Callable functions

- `registerPushSubscription` — authenticated, validates and stores the caller's own Web Push subscription.
- `unregisterPushSubscription` — authenticated, removes a subscription belonging to the caller.
- `recordNewSession` — authenticated, records a first-seen browser ID for the caller and creates a security notice. It limits new session records to 10 per user per UTC day.

Firestore triggers `onMessageCreated`, `onMessageReactionUpdated`, `onCallCreated`, and `onCallUpdated` create and deliver the other events. Function retries use per-user event markers so a retry does not create another inbox record.

### Browser push setup

Push requires HTTPS (localhost is suitable for development), a deployed service worker, and browser support. On iOS/iPadOS, Web Push requires a supported installed web app. The permission prompt is not shown at login: users choose **Enable** in the notification center after seeing what background alerts are for. If permission was denied earlier, they must re-enable it in the browser's site settings.

1. Install function dependencies with `npm ci --prefix functions`.
2. Generate one VAPID key pair with `npm exec --prefix functions -- web-push generate-vapid-keys`. Keep the private key out of the frontend and source control.
3. Store the private key in Firebase Secret Manager: `firebase functions:secrets:set WEB_PUSH_VAPID_PRIVATE_KEY`.
4. Add the matching public key to the frontend build environment as `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` and to `functions/.env.<firebase-project-id>` as `WEB_PUSH_VAPID_PUBLIC_KEY`.
5. Set `WEB_PUSH_CONTACT_EMAIL` in `functions/.env.<firebase-project-id>` to a monitored contact, for example `mailto:notifications@example.com`.
6. Ensure `VITE_FIREBASE_FUNCTIONS_REGION` in the frontend build and `setGlobalOptions({ region: ... })` in `functions/index.js` use the same region. Change the default `us-central1` if the Firestore database is hosted elsewhere.
7. Deploy the Firestore rules, indexes/TTL policies, and notification functions: `firebase deploy --only firestore:rules,firestore:indexes,functions`.
8. TTL cleanup is eventual (Firestore may take up to 24 hours after expiry to delete a record) and incurs standard delete-operation charges. The TTL policies are included in `firestore.indexes.json`.

`VITE_WEB_PUSH_VAPID_PUBLIC_KEY` and the functions runtime public key must match. The private VAPID key belongs only in Secret Manager. Firebase may require enabling Cloud Functions/Cloud Build and billing for the project before deployment. Set a non-placeholder VAPID contact email before production use.

### Development and verification

Run `npm run build` for the web app and `npm run test:notifications` for the notification policy tests. The tests cover direct/channel preference defaults, category gates, quiet hours across midnight, preview privacy, and message aggregation. For a full multi-user test, deploy the rules/functions to a Firebase project or use the Firebase Emulator Suite, configure a VAPID pair, sign in as two separate users, and use two browsers/devices to verify message, mention, reaction, call, offline, mute, and cross-device behavior. The local unit tests do not send real browser push messages.

To exercise Auth, Firestore rules, and Functions locally, install the Firebase CLI and run `firebase emulators:start --only auth,firestore,functions,ui`. In the Vite environment set `VITE_USE_FIREBASE_EMULATORS=true` and, if needed, `VITE_FIREBASE_EMULATOR_HOST=127.0.0.1`. The app uses the `us-central1` Functions region by default. Browser push delivery still needs a valid VAPID pair and a browser subscription; emulator runs alone do not verify delivery through a browser push service.

### Remaining scope

The current checks verify policy helpers and the production frontend build. They do not emulate Firebase Authentication, Firestore rules, Cloud Functions delivery, browser push services, or Amazon Chime. Those integration scenarios require the Firebase Emulator Suite or a configured deployed Firebase project and real browser subscriptions. The existing public channels also have no membership records, so broad group delivery is restricted to explicit mentions/replies and users who opted in.

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
