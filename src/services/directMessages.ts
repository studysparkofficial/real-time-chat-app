import { ChatUser, DirectConversationParticipant } from '../types/chat.types';

export const DIRECT_CONVERSATION_PREFIX = 'dm_';

export function isDirectConversationId(id: string): boolean {
  return id.startsWith(DIRECT_CONVERSATION_PREFIX);
}

export function getDirectConversationId(firstUid: string, secondUid: string): string {
  const [first, second] = [firstUid, secondUid].sort();
  // Length prefixes make this unambiguous even if a UID contains underscores.
  return `${DIRECT_CONVERSATION_PREFIX}${first.length}_${first}_${second.length}_${second}`;
}

export function toConversationParticipant(user: ChatUser): DirectConversationParticipant {
  return {
    uid: user.uid,
    displayName: user.displayName || 'JNU Scholar',
    photoURL: user.photoURL || null,
    isAnonymous: Boolean(user.isAnonymous)
  };
}

export function toChatUser(profile: Partial<ChatUser> & { uid: string }): ChatUser {
  return {
    uid: profile.uid,
    displayName: profile.displayName || 'JNU Scholar',
    email: null,
    photoURL: profile.photoURL || '👤',
    isAnonymous: Boolean(profile.isAnonymous),
    status: profile.status || 'offline',
    bio: profile.bio || '',
    hostel: profile.hostel,
    centre: profile.centre,
    lastSeen: profile.lastSeen
  };
}
