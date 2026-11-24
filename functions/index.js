import { createHash } from 'node:crypto';
import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import webPush from 'web-push';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  isInQuietHours,
  messageBody,
  deriveMessageRecipients,
  findNewReactionUids,
  notificationEnabled,
  resolveNotificationSettings
} from './lib/notificationPolicy.js';

if (getApps().length === 0) initializeApp();
const db = getFirestore();
setGlobalOptions({ region: 'us-central1', maxInstances: 10, timeoutSeconds: 120 });

const vapidPublicKey = defineString('WEB_PUSH_VAPID_PUBLIC_KEY', { default: '' });
const vapidPrivateKey = defineSecret('WEB_PUSH_VAPID_PRIVATE_KEY');
const vapidContact = defineString('WEB_PUSH_CONTACT_EMAIL', { default: 'mailto:admin@example.com' });
const SUBSCRIPTION_LIMIT = 10;
const NOTIFICATION_TTL_DAYS = 90;
const DEDUPE_TTL_DAYS = 30;

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function privateCollection(uid, name) {
  return db.collection('user_private').doc(uid).collection(name);
}

async function getSettings(uid) {
  const snapshot = await privateCollection(uid, 'notification_settings').doc('preferences').get();
  return resolveNotificationSettings(snapshot.exists ? snapshot.data() : DEFAULT_NOTIFICATION_SETTINGS);
}

async function isRoomMuted(uid, roomId) {
  if (!roomId) return false;
  const snapshot = await privateCollection(uid, 'muted_rooms').doc(roomId).get();
  return snapshot.exists && snapshot.data()?.muted === true;
}

async function allowIncomingCallNotification(callerUid, callId) {
  const callEvents = privateCollection(callerUid, 'call_notification_events');
  const eventRef = callEvents.doc(digest(callId).slice(0, 40));
  const rateRef = privateCollection(callerUid, 'call_rate_limits').doc('ringing_calls');
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + 2 * 24 * 60 * 60 * 1000);
  return db.runTransaction(async (transaction) => {
    const priorEvent = await transaction.get(eventRef);
    if (priorEvent.exists) return priorEvent.data()?.allowed === true;
    const rateSnapshot = await transaction.get(rateRef);
    const rate = rateSnapshot.exists ? rateSnapshot.data() : {};
    const activeWindow = now - Number(rate.windowStartedAt || 0) < 60_000;
    const count = activeWindow ? Number(rate.count || 0) : 0;
    const allowed = count < 5;
    transaction.create(eventRef, { allowed, createdAt: FieldValue.serverTimestamp(), expiresAt });
    if (allowed) transaction.set(rateRef, {
      windowStartedAt: activeWindow ? rate.windowStartedAt : now,
      count: count + 1,
      expiresAt
    });
    return allowed;
  });
}

function categoryFor(type, isDirect) {
  if (type === 'incoming_call' || type === 'missed_call' || type === 'call_status') return 'calls';
  if (type === 'group_announcement' || type === 'group_membership') return 'groups';
  if (type === 'security') return 'security';
  if (type === 'system') return 'system';
  return isDirect ? 'messages' : 'groups';
}

function pushTag(type, data) {
  if (type === 'incoming_call' || type === 'missed_call' || type === 'call_status') {
    return `call-${data.callId || 'update'}`;
  }
  return `chat-${data.roomId || data.entityId || type}`;
}

function pushUrl(data) {
  const params = new URLSearchParams();
  if (data.roomId) params.set('notificationRoom', data.roomId);
  if (data.messageId) params.set('notificationMessage', data.messageId);
  if (data.callId) params.set('notificationCall', data.callId);
  return params.size ? `/?${params.toString()}` : '/';
}

async function sendPush(uid, type, notification, settings, count = 1) {
  if (!settings.pushEnabled || isInQuietHours(settings)) return 'skipped';
  const publicKey = vapidPublicKey.value();
  if (!publicKey) return 'skipped';
  const privateKey = vapidPrivateKey.value();
  if (!privateKey) return 'skipped';

  const subscriptions = await privateCollection(uid, 'push_subscriptions').limit(SUBSCRIPTION_LIMIT).get();
  if (subscriptions.empty) return 'skipped';

  webPush.setVapidDetails(vapidContact.value(), publicKey, privateKey);
  const payload = JSON.stringify({
    title: notification.title,
    options: {
      body: count > 1 && notification.category === 'messages'
        ? `${count} new messages`
        : notification.body,
      tag: pushTag(notification.type, notification),
      icon: '/pwa-icon-192.png',
      badge: '/favicon.png',
      requireInteraction: notification.type === 'incoming_call',
      silent: !settings.sounds,
      data: { url: pushUrl(notification), notificationId: notification.id }
    }
  });

  const results = await Promise.allSettled(subscriptions.docs.map(async (subscriptionDoc) => {
    const subscription = subscriptionDoc.data();
    try {
      await webPush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload, {
        TTL: notification.type === 'incoming_call' ? 60 : 60 * 60 * 24,
        urgency: notification.type === 'incoming_call' ? 'high' : 'normal'
      });
      await subscriptionDoc.ref.update({ lastUsedAt: FieldValue.serverTimestamp() });
      return true;
    } catch (error) {
      const statusCode = error?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await subscriptionDoc.ref.delete();
        return false;
      } else {
        console.warn('[Notifications] Push delivery failed:', statusCode || error?.message || error);
        throw error;
      }
    }
  }));
  if (results.some((result) => result.status === 'fulfilled' && result.value === true)) return 'sent';
  if (results.some((result) => result.status === 'rejected')) return 'pending';
  return 'skipped';
}

async function sendClearPush(uid, tag) {
  const publicKey = vapidPublicKey.value();
  if (!publicKey) return;
  const privateKey = vapidPrivateKey.value();
  if (!privateKey) return;
  const subscriptions = await privateCollection(uid, 'push_subscriptions').limit(SUBSCRIPTION_LIMIT).get();
  if (subscriptions.empty) return;
  webPush.setVapidDetails(vapidContact.value(), publicKey, privateKey);
  const payload = JSON.stringify({ action: 'clear', options: { tag } });
  await Promise.allSettled(subscriptions.docs.map((entry) =>
    webPush.sendNotification({ endpoint: entry.data().endpoint, keys: entry.data().keys }, payload, { TTL: 60 })
      .catch((error) => {
        if (error?.statusCode === 404 || error?.statusCode === 410) return entry.ref.delete();
        console.warn('[Notifications] Could not clear call push:', error?.statusCode || error?.message || error);
      })
  ));
}

/** Create one durable in-app notification per event and group rapid messages. */
async function createNotification({
  uid,
  type,
  title,
  body,
  eventKey,
  aggregationKey,
  senderUid,
  senderName,
  roomId,
  messageId,
  callId,
  entityId,
  isDirect = false,
  settings: suppliedSettings,
  bypassMute = false
}) {
  if (!uid || uid === senderUid) return null;
  const settings = suppliedSettings || await getSettings(uid);
  if (!notificationEnabled(type, isDirect, settings)) return null;
  if (!bypassMute && roomId && await isRoomMuted(uid, roomId)) return null;

  const now = Date.now();
  const fiveMinuteBucket = Math.floor(now / (5 * 60 * 1000));
  const stableAggregationKey = aggregationKey ? `${aggregationKey}:${fiveMinuteBucket}` : null;
  const notificationId = stableAggregationKey
    ? `agg_${digest(stableAggregationKey).slice(0, 40)}`
    : `evt_${digest(eventKey).slice(0, 40)}`;
  const notificationRef = privateCollection(uid, 'notifications').doc(notificationId);
  const eventRef = privateCollection(uid, 'notification_events').doc(digest(eventKey).slice(0, 48));
  const expiresAt = Timestamp.fromMillis(now + NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const eventExpiresAt = Timestamp.fromMillis(now + DEDUPE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const result = await db.runTransaction(async (transaction) => {
    const eventSnapshot = await transaction.get(eventRef);
    if (eventSnapshot.exists) {
      return {
        duplicate: true,
        notificationId: eventSnapshot.data()?.notificationId,
        count: Number(eventSnapshot.data()?.count || 1),
        pushStatus: eventSnapshot.data()?.pushStatus || 'pending'
      };
    }
    const notificationSnapshot = await transaction.get(notificationRef);
    const count = notificationSnapshot.exists ? Number(notificationSnapshot.data()?.count || 0) + 1 : 1;
    const notificationData = {
      type,
      category: categoryFor(type, isDirect),
      title,
      body: typeof body === 'function' ? body(count) : body,
      senderUid: senderUid || null,
      senderName: senderName || null,
      roomId: roomId || null,
      messageId: messageId || null,
      callId: callId || null,
      entityId: entityId || null,
      count,
      isRead: false,
      readAt: null,
      deliveryStatus: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt
    };
    if (notificationSnapshot.exists) transaction.set(notificationRef, notificationData, { merge: true });
    else transaction.create(notificationRef, notificationData);
    transaction.create(eventRef, {
      notificationId,
      count,
      pushStatus: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: eventExpiresAt
    });
    return { duplicate: false, notificationId, count, pushStatus: 'pending' };
  });

  if (result.duplicate && result.pushStatus !== 'pending') return null;
  const notification = {
    id: result.notificationId || notificationId, type, category: categoryFor(type, isDirect), title,
    body: typeof body === 'function' ? body(result.count) : body,
    roomId, messageId, callId, entityId
  };
  const pushStatus = await sendPush(uid, type, notification, settings, result.count);
  await Promise.all([
    eventRef.set({ pushStatus }, { merge: true }),
    notificationRef.set({ deliveryStatus: pushStatus }, { merge: true })
  ]);
  if (pushStatus === 'pending') throw new Error('Temporary web-push failure; retry this notification event.');
  return result.notificationId || notificationId;
}

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validateSubscription(data) {
  if (!data || typeof data !== 'object') return null;
  const endpoint = cleanString(data.endpoint, 2048);
  const p256dh = cleanString(data.keys?.p256dh, 256);
  const auth = cleanString(data.keys?.auth, 256);
  try {
    if (new URL(endpoint).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  if (!p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

export const registerPushSubscription = onCall({ maxInstances: 5 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in before enabling browser alerts.');
  const subscription = validateSubscription(request.data?.subscription);
  if (!subscription) throw new HttpsError('invalid-argument', 'The browser push subscription is invalid.');
  const id = digest(subscription.endpoint).slice(0, 40);
  const collection = privateCollection(uid, 'push_subscriptions');
  const userSubscriptions = await collection.limit(SUBSCRIPTION_LIMIT + 1).get();
  const target = collection.doc(id);
  if (!userSubscriptions.docs.some((entry) => entry.id === id) && userSubscriptions.size >= SUBSCRIPTION_LIMIT) {
    throw new HttpsError('resource-exhausted', 'This account already has the maximum number of alert-enabled devices.');
  }
  await target.set({
    ...subscription,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastUsedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await privateCollection(uid, 'notification_settings').doc('preferences').set({ pushEnabled: true }, { merge: true });
  return { success: true };
});

export const unregisterPushSubscription = onCall({ maxInstances: 5 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in before managing browser alerts.');
  const endpoint = cleanString(request.data?.endpoint, 2048);
  if (!endpoint) throw new HttpsError('invalid-argument', 'A push endpoint is required.');
  const id = digest(endpoint).slice(0, 40);
  await privateCollection(uid, 'push_subscriptions').doc(id).delete();
  return { success: true };
});

export const recordNewSession = onCall({ maxInstances: 5, secrets: [vapidPrivateKey] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in before recording this session.');
  const deviceId = cleanString(request.data?.deviceId, 80);
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(deviceId)) {
    throw new HttpsError('invalid-argument', 'This browser session identifier is invalid.');
  }
  const deviceLabel = cleanString(request.data?.deviceLabel, 80) || 'Browser';
  const sessions = privateCollection(uid, 'security_sessions');
  const sessionRef = sessions.doc(deviceId);
  const rateRef = sessions.doc('_daily_limit');
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const shouldNotify = await db.runTransaction(async (transaction) => {
    const session = await transaction.get(sessionRef);
    if (session.exists) return false;
    const rate = await transaction.get(rateRef);
    const rateData = rate.exists ? rate.data() : {};
    const count = rateData.day === today ? Number(rateData.count || 0) : 0;
    if (count >= 10) return false;
    transaction.create(sessionRef, {
      deviceLabel,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000)
    });
    transaction.set(rateRef, {
      day: today,
      count: count + 1,
      expiresAt: Timestamp.fromMillis(Date.now() + 2 * 24 * 60 * 60 * 1000)
    });
    return true;
  });
  if (shouldNotify) {
    await createNotification({
      uid,
      type: 'security',
      title: 'New sign-in',
      body: `A new ${deviceLabel} signed in to your account`,
      eventKey: `new-session:${uid}:${deviceId}`,
      entityId: deviceId,
      isDirect: true,
      bypassMute: true
    });
  }
  return { recorded: shouldNotify };
});

const S3_API_GATEWAY_URL = 'https://0sz03xhubg.execute-api.ap-southeast-2.amazonaws.com/prod/upload-url';

export const getMediaDownloadUrl = onCall({ maxInstances: 10 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to access media.');
  }
  const { key, roomId, messageId, contentType, fileName, disposition } = request.data || {};
  if (!key) {
    throw new HttpsError('invalid-argument', 'Missing key parameter.');
  }

  try {
    const payload = {
      action: 'download',
      key,
      roomId: roomId || 'campus-central',
      messageId: messageId || 'msg',
      contentType: contentType || 'application/octet-stream',
      fileName: fileName || 'file',
      disposition: disposition || 'inline'
    };

    const response = await fetch(S3_API_GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { message: responseText };
    }

    if (!response.ok) {
      throw new HttpsError('internal', data.error || data.message || 'Failed to generate download URL');
    }

    const downloadUrl = data.downloadUrl || data.url || data.signedUrl || data.getUrl;
    return {
      downloadUrl,
      expiresIn: data.expiresIn || 900
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('[CloudFunction] getMediaDownloadUrl error:', err);
    throw new HttpsError('internal', 'Could not obtain signed S3 download URL.');
  }
});

export const getMediaUploadUrl = onCall({ maxInstances: 10 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to upload media.');
  }
  const { fileName, contentType, size } = request.data || {};
  if (!fileName || !contentType) {
    throw new HttpsError('invalid-argument', 'Missing fileName or contentType parameter.');
  }

  try {
    const response = await fetch(S3_API_GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, contentType, size })
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { message: responseText };
    }

    if (!response.ok) {
      throw new HttpsError('internal', data.error || data.message || 'Failed to generate upload URL');
    }

    return data;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('[CloudFunction] getMediaUploadUrl error:', err);
    throw new HttpsError('internal', 'Could not obtain signed S3 upload URL.');
  }
});

export const onMessageCreated = onDocumentCreated({
  document: 'rooms/{roomId}/messages/{messageId}',
  retry: true,
  secrets: [vapidPrivateKey]
}, async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  const message = snapshot.data();
  const roomId = event.params.roomId;
  const senderUid = message.sender?.uid || message.senderId;
  if (typeof senderUid !== 'string' || !senderUid) return;

  const roomSnapshot = await db.collection('rooms').doc(roomId).get();
  const isDirect = roomSnapshot.exists && roomSnapshot.data()?.type === 'direct';
  const participants = isDirect && Array.isArray(roomSnapshot.data()?.participants)
    ? roomSnapshot.data().participants.filter((uid) => uid !== senderUid)
    : [];
  let mentionUids = [];
  let replyUid;
  let optedInUserIds = [];
  if (!isDirect) {
    const mentionedUids = Array.isArray(message.mentions)
      ? [...new Set(message.mentions.filter((uid) => typeof uid === 'string' && uid !== senderUid))].slice(0, 10)
      : [];
    if (mentionedUids.length > 0) {
      const profiles = await db.getAll(...mentionedUids.map((uid) => db.collection('user_profiles').doc(uid)));
      mentionUids = profiles.flatMap((profile, index) => profile.exists ? [mentionedUids[index]] : []);
    }
    replyUid = message.replyTo?.senderUid;
    const replyProfile = typeof replyUid === 'string' && replyUid !== senderUid
      ? await db.collection('user_profiles').doc(replyUid).get()
      : null;
    if (!replyProfile?.exists) replyUid = undefined;

    // Public channels have no stored membership list. Deliver ordinary channel
    // alerts only to users who opted in; mentions/replies are explicitly targeted.
    let page = null;
    do {
      let optedInQuery = db.collectionGroup('notification_settings').where('groupMessages', '==', true).limit(500);
      if (page && !page.empty) optedInQuery = optedInQuery.startAfter(page.docs[page.docs.length - 1]);
      page = await optedInQuery.get();
      page.forEach((settingsDoc) => {
        const uid = settingsDoc.ref.parent.parent?.id;
        if (uid && uid !== senderUid) optedInUserIds.push(uid);
      });
    } while (page.size === 500);
  } else {
    mentionUids = Array.isArray(message.mentions) ? message.mentions : [];
    replyUid = message.replyTo?.senderUid;
  }

  const recipients = deriveMessageRecipients({
    senderUid,
    isDirect,
    participants,
    mentionedUids: mentionUids,
    replyUid,
    optedInUserIds
  });

  const senderName = cleanString(message.sender?.displayName || message.sender?.username, 80) || 'Someone';
  const messageText = cleanString(message.text, 500);
  const attachment = message.attachment && typeof message.attachment === 'object' ? message.attachment : null;
  for (let offset = 0; offset < recipients.length; offset += 50) {
    await Promise.all(recipients.slice(offset, offset + 50).map(async ({ uid, type }) => {
      const settings = await getSettings(uid);
      await createNotification({
        uid,
        type,
        title: type === 'mention' ? `${senderName} mentioned you` : senderName,
        body: (count) => messageBody({ senderName, text: messageText, attachment, count, showPreview: settings.messagePreviews }),
        eventKey: `message:${roomId}:${snapshot.id}:${uid}`,
        aggregationKey: type === 'message' ? `message:${roomId}:${senderUid}` : null,
        senderUid,
        senderName,
        roomId,
        messageId: snapshot.id,
        isDirect,
        settings
      });
    }));
  }
});

export const onMessageReactionUpdated = onDocumentUpdated({
  document: 'rooms/{roomId}/messages/{messageId}',
  retry: true,
  secrets: [vapidPrivateKey]
}, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.sender?.uid === undefined || after.sender?.uid === undefined) return;
  const ownerUid = after.sender.uid;
  const roomId = event.params.roomId;
  const reactors = findNewReactionUids(before.reactions || {}, after.reactions || {}, ownerUid);
  if (reactors.length === 0) return;
  const roomSnapshot = await db.collection('rooms').doc(roomId).get();
  const isDirect = roomSnapshot.exists && roomSnapshot.data()?.type === 'direct';
  const participants = isDirect ? roomSnapshot.data()?.participants || [] : [];
  for (const reactorUid of reactors) {
    if (isDirect && !participants.includes(reactorUid)) continue;
    const profile = await db.collection('user_profiles').doc(reactorUid).get();
    const reactorName = cleanString(profile.data()?.displayName, 80) || 'Someone';
    await createNotification({
      uid: ownerUid,
      type: 'reaction',
      title: `${reactorName} reacted to your message`,
      body: 'Someone reacted to a message you sent',
      eventKey: `reaction:${event.id}:${reactorUid}`,
      aggregationKey: null,
      senderUid: reactorUid,
      senderName: reactorName,
      roomId,
      messageId: event.params.messageId,
      isDirect
    });
  }
});

export const onCallCreated = onDocumentCreated({
  document: 'calls/{callId}',
  retry: true,
  secrets: [vapidPrivateKey]
}, async (event) => {
  const call = event.data?.data();
  if (!call?.recipient?.uid || !call?.caller?.uid) return;
  if (!['ringing', 'initiating'].includes(call.status)) return;
  const recipientUid = call.recipient.uid;
  const callerUid = call.caller.uid;
  const liveCall = await db.collection('calls').doc(event.params.callId).get();
  if (!liveCall.exists || !['ringing', 'initiating'].includes(liveCall.data()?.status)) return;
  const recipientProfile = await db.collection('user_profiles').doc(recipientUid).get();
  if (!recipientProfile.exists) return;
  if (!await allowIncomingCallNotification(callerUid, event.params.callId)) {
    await liveCall.ref.update({ status: 'busy', endedAt: Date.now(), endedReason: 'busy' });
    return;
  }
  const settings = await getSettings(recipientUid);
  const callType = call.callType === 'video' ? 'video' : 'voice';
  if (callType === 'voice' ? !settings.voiceCalls : !settings.videoCalls) return;
  await createNotification({
    uid: recipientUid,
    type: 'incoming_call',
    title: `Incoming ${callType} call`,
    body: `${cleanString(call.caller.displayName, 80) || 'Someone'} is calling you`,
    eventKey: `call:${event.params.callId}:incoming:${recipientUid}`,
    senderUid: call.caller.uid,
    senderName: call.caller.displayName,
    callId: event.params.callId,
    entityId: event.params.callId,
    isDirect: true,
    settings,
    bypassMute: true
  });
});

export const onCallUpdated = onDocumentUpdated({
  document: 'calls/{callId}',
  retry: true,
  secrets: [vapidPrivateKey]
}, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.status === after.status) return;
  const callId = event.params.callId;
  // updateCallStatus sometimes swaps the recipient field to address its socket
  // peer. `before` retains the original person being called.
  const recipientUid = before.recipient?.uid || after.recipient?.uid;
  const callerUid = after.caller?.uid;
  const terminal = ['accepted', 'rejected', 'busy', 'missed', 'ended', 'failed'].includes(after.status);

  if (terminal && recipientUid) {
    await sendClearPush(recipientUid, `call-${callId}`);
    const incoming = await privateCollection(recipientUid, 'notifications').where('callId', '==', callId).get();
    const batch = db.batch();
    incoming.docs.forEach((docSnapshot) => batch.update(docSnapshot.ref, {
      isRead: true,
      readAt: FieldValue.serverTimestamp()
    }));
    if (!incoming.empty) await batch.commit();
  }

  if (after.status === 'missed' && recipientUid) {
    const callerName = cleanString(before.caller?.displayName || after.caller?.displayName, 80) || 'Someone';
    await createNotification({
      uid: recipientUid,
      type: 'missed_call',
      title: 'Missed call',
      body: `You missed a ${after.callType === 'video' ? 'video' : 'voice'} call from ${callerName}`,
      eventKey: `call:${callId}:missed:${recipientUid}`,
      senderUid: after.caller?.uid,
      senderName: callerName,
      callId,
      entityId: callId,
      isDirect: true,
      bypassMute: true
    });
    return;
  }

  if (['rejected', 'busy', 'failed'].includes(after.status) && callerUid) {
    const callType = after.callType === 'video' ? 'video' : 'voice';
    const callerSettings = await getSettings(callerUid);
    if (callType === 'video' ? !callerSettings.videoCalls : !callerSettings.voiceCalls) return;
    const recipientName = cleanString(before.recipient?.displayName || after.recipient?.displayName, 80) || 'The other person';
    await createNotification({
      uid: callerUid,
      type: 'call_status',
      title: 'Call update',
      body: after.status === 'rejected' ? `${recipientName} declined your call`
        : after.status === 'busy' ? `${recipientName} is busy`
          : 'Your call could not connect',
      eventKey: `call:${callId}:${after.status}:${callerUid}`,
      senderUid: after.recipient?.uid,
      senderName: recipientName,
      callId,
      entityId: callId,
      isDirect: true,
      settings: callerSettings,
      bypassMute: true
    });
  }
});

