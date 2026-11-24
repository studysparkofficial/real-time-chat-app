export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  personalMessages: true,
  groupMessages: false,
  mentions: true,
  replies: true,
  reactions: true,
  voiceCalls: true,
  videoCalls: true,
  missedCalls: true,
  groupAnnouncements: true,
  statusNotifications: false,
  securityNotifications: true,
  systemNotifications: true,
  pushEnabled: false,
  sounds: true,
  messagePreviews: false,
  quietHours: { enabled: false, start: '22:00', end: '08:00', timeZone: 'Asia/Kolkata' }
});

export function resolveNotificationSettings(value = {}) {
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...value,
    quietHours: { ...DEFAULT_NOTIFICATION_SETTINGS.quietHours, ...(value.quietHours || {}) }
  };
}

export function notificationEnabled(type, isDirect, settings) {
  const resolved = resolveNotificationSettings(settings);
  switch (type) {
    case 'message': return isDirect ? resolved.personalMessages : resolved.groupMessages;
    case 'reply': return resolved.replies;
    case 'mention': return resolved.mentions;
    case 'reaction': return resolved.reactions;
    case 'incoming_call': return resolved.voiceCalls || resolved.videoCalls;
    case 'missed_call': return resolved.missedCalls;
    case 'call_status': return resolved.voiceCalls || resolved.videoCalls;
    case 'group_announcement':
    case 'group_membership': return resolved.groupAnnouncements;
    case 'status_mention':
    case 'status_reply':
    case 'status_reaction': return resolved.statusNotifications;
    case 'security': return resolved.securityNotifications;
    case 'system': return resolved.systemNotifications;
    default: return false;
  }
}

export function deriveMessageRecipients({
  senderUid,
  isDirect,
  participants = [],
  mentionedUids = [],
  replyUid,
  optedInUserIds = []
}) {
  const recipients = new Map();
  const allowed = new Set(isDirect ? participants : optedInUserIds);
  for (const uid of allowed) {
    if (typeof uid === 'string' && uid && uid !== senderUid) recipients.set(uid, 'message');
  }
  for (const uid of mentionedUids) {
    if (typeof uid === 'string' && uid && uid !== senderUid && (!isDirect || allowed.has(uid))) {
      recipients.set(uid, 'mention');
    }
  }
  if (typeof replyUid === 'string' && replyUid && replyUid !== senderUid && (!isDirect || allowed.has(replyUid))) {
    if (!recipients.has(replyUid) || recipients.get(replyUid) === 'message') recipients.set(replyUid, 'reply');
  }
  return [...recipients].map(([uid, type]) => ({ uid, type }));
}

export function findNewReactionUids(before = {}, after = {}, ownerUid) {
  const reactors = new Set();
  for (const [emoji, uids] of Object.entries(after || {})) {
    const previous = new Set(Array.isArray(before?.[emoji]) ? before[emoji] : []);
    (Array.isArray(uids) ? uids : []).forEach((uid) => {
      if (typeof uid === 'string' && uid !== ownerUid && !previous.has(uid)) reactors.add(uid);
    });
  }
  return [...reactors];
}

function parseClock(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function isInQuietHours(settings, now = new Date()) {
  const quiet = resolveNotificationSettings(settings).quietHours;
  if (!quiet.enabled) return false;
  const start = parseClock(quiet.start);
  const end = parseClock(quiet.end);
  if (start === null || end === null || start === end) return false;

  let current;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: quiet.timeZone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
    current = hour * 60 + minute;
  } catch {
    return false;
  }

  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

export function messageBody({ senderName, text, attachment, count = 1, showPreview = false }) {
  const sender = senderName || 'Someone';
  let detail = 'sent you a message';
  if (attachment?.category === 'image') detail = 'sent you a photo';
  else if (attachment?.category === 'video') detail = 'sent you a video';
  else if (attachment?.category === 'audio') detail = 'sent you an audio message';
  else if (attachment) detail = 'sent you a document';
  else if (showPreview && text) detail = String(text).replace(/\s+/g, ' ').trim().slice(0, 120);

  if (count > 1) return `${count} new messages from ${sender}`;
  return `${sender}: ${detail}`;
}
