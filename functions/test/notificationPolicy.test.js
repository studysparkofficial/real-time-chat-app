import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  deriveMessageRecipients,
  findNewReactionUids,
  isInQuietHours,
  messageBody,
  notificationEnabled,
  resolveNotificationSettings
} from '../lib/notificationPolicy.js';

test('personal messages default on while public channel message alerts default off', () => {
  assert.equal(notificationEnabled('message', true, DEFAULT_NOTIFICATION_SETTINGS), true);
  assert.equal(notificationEnabled('message', false, DEFAULT_NOTIFICATION_SETTINGS), false);
});

test('category preferences gate mentions, calls, missed calls and status alerts', () => {
  const settings = resolveNotificationSettings({ mentions: false, videoCalls: false, voiceCalls: true });
  assert.equal(notificationEnabled('mention', false, settings), false);
  assert.equal(notificationEnabled('incoming_call', true, settings), true);
  assert.equal(notificationEnabled('status_mention', false, settings), false);
});

test('quiet hours handle windows that cross midnight in the selected timezone', () => {
  const settings = resolveNotificationSettings({
    quietHours: { enabled: true, start: '22:00', end: '08:00', timeZone: 'UTC' }
  });
  assert.equal(isInQuietHours(settings, new Date('2026-01-10T23:30:00Z')), true);
  assert.equal(isInQuietHours(settings, new Date('2026-01-10T06:30:00Z')), true);
  assert.equal(isInQuietHours(settings, new Date('2026-01-10T12:00:00Z')), false);
});

test('message copy is generic by default and respects opted-in previews', () => {
  const message = { senderName: 'Asha', text: 'Are you coming?', attachment: null };
  assert.equal(messageBody(message), 'Asha: sent you a message');
  assert.equal(messageBody({ ...message, showPreview: true }), 'Asha: Are you coming?');
});

test('repeated messages aggregate without exposing previews', () => {
  assert.equal(messageBody({ senderName: 'Asha', count: 3 }), '3 new messages from Asha');
});

test('direct messages notify only the other participant and never the sender', () => {
  assert.deepEqual(deriveMessageRecipients({
    senderUid: 'alice',
    isDirect: true,
    participants: ['alice', 'bob']
  }), [{ uid: 'bob', type: 'message' }]);
});

test('group messages only alert opted-in users, while mentions and replies target their users', () => {
  assert.deepEqual(deriveMessageRecipients({
    senderUid: 'alice',
    isDirect: false,
    optedInUserIds: ['alice', 'bob'],
    mentionedUids: ['carol'],
    replyUid: 'dave'
  }), [
    { uid: 'bob', type: 'message' },
    { uid: 'carol', type: 'mention' },
    { uid: 'dave', type: 'reply' }
  ]);
});

test('mentions take precedence over reply and self-mentions are removed', () => {
  assert.deepEqual(deriveMessageRecipients({
    senderUid: 'alice',
    isDirect: true,
    participants: ['alice', 'bob'],
    mentionedUids: ['alice', 'bob'],
    replyUid: 'bob'
  }), [{ uid: 'bob', type: 'mention' }]);
});

test('reactions notify only on a newly added reaction and never notify the message owner', () => {
  assert.deepEqual(findNewReactionUids(
    { '👍': ['bob'] },
    { '👍': ['bob', 'carol'], '❤️': ['alice'] },
    'alice'
  ), ['carol']);
});
