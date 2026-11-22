export type UserPresenceStatus = 'online' | 'away' | 'busy' | 'offline';

export interface ChatUser {
  uid: string;
  displayName: string;
  email?: string | null;
  photoURL?: string | null;
  isAnonymous?: boolean;
  status: UserPresenceStatus;
  bio?: string;
  hostel?: string; // JNU Hostel (Ganga, Yamuna, Jhelum, Sutlej, etc.)
  centre?: string; // School/Centre (SIS, SL, SSS, SPS, etc.)
  lastSeen?: number;
}

export interface DirectConversationParticipant {
  uid: string;
  displayName: string;
  photoURL?: string | null;
  isAnonymous?: boolean;
}

export interface DirectConversation {
  id: string;
  participants: string[];
  participantInfo: Record<string, DirectConversationParticipant>;
  lastMessage?: string;
  lastMessageAt?: number;
  lastSenderUid?: string;
  peer: ChatUser;
}

export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed';

export interface MessageAttachment {
  key: string;
  url?: string;
  downloadUrl?: string;
  previewUrl?: string;
  name?: string;
  fileName?: string;
  size?: number;
  fileSize?: number;
  mimeType?: string;
  type?: string;
  category: 'image' | 'video' | 'pdf' | 'audio' | 'file';
  duration?: number;
  blurhash?: string;
  uploadState?: 'uploading' | 'failed';
  uploadProgress?: number;
  retryAvailable?: boolean;
}

export interface MessageReplyReference {
  id: string;
  text: string;
  senderName: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  text: string;
  sender: {
    uid: string;
    displayName: string;
    photoURL?: string | null;
    isAnonymous?: boolean;
  };
  timestamp: number;
  status: MessageDeliveryStatus;
  attachment?: MessageAttachment | null;
  reactions?: Record<string, string[]>; // emoji -> array of uids
  replyTo?: MessageReplyReference | null;
  clientTempId?: string;
  isOptimistic?: boolean;
  errorMessage?: string;
}

export interface ChatRoom {
  id: string;
  name: string;
  slug: string;
  icon: string;
  topic: string;
  isCustom?: boolean;
  createdAt?: number;
  createdBy?: string;
}

export interface TypingUser {
  uid: string;
  displayName: string;
  timestamp: number;
}

export interface UserPreferences {
  theme: 'dark' | 'light';
  soundEnabled: boolean;
  hapticsEnabled: boolean;
}
