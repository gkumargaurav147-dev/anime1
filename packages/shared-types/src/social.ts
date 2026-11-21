// ----- Friends -----

/** What other users may see about someone: never age, phone or anything else. */
export interface UserSummary {
  id: string;
  username: string;
}

export interface Friend extends UserSummary {
  friendsSince: string;
  /** Direct conversation with this friend. */
  conversationId: string;
}

export interface FriendRequest {
  user: UserSummary;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
}

export interface FriendsResponse {
  friends: Friend[];
}

export interface FriendRequestsResponse {
  requests: FriendRequest[];
}

/** Exactly one of username / qrToken. Usernames must match exactly (case-insensitive). */
export interface SendFriendRequestBody {
  username?: string;
  qrToken?: string;
}

export interface SendFriendRequestResponse {
  /** 'accepted' when the other person had already asked you. */
  status: 'pending' | 'accepted';
  user: UserSummary;
}

export interface FriendQrResponse {
  /** Signed, short-lived token to render as a QR code. */
  qrToken: string;
  expiresInSeconds: number;
}

export interface BlocksResponse {
  blocked: UserSummary[];
}

// ----- Chat -----

export type MessageStatus = 'sent' | 'delivered' | 'seen';

/** Reserved for later milestones; always null for now. */
export type AnimeScene = Record<string, unknown> | null;

export interface Message {
  id: string;
  conversationId: string;
  /** Per-conversation, strictly increasing. Used as the pagination/sync cursor. */
  seq: number;
  senderId: string;
  clientMessageId: string;
  text: string;
  animeScene: AnimeScene;
  status: MessageStatus;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  kind: 'direct';
  peer: UserSummary;
  /** False after unfriending or blocking: history stays readable, sending is refused. */
  canSend: boolean;
  lastSeq: number;
  lastMessage: Message | null;
  /** Your own pointers. */
  deliveredUpTo: number;
  seenUpTo: number;
  /** The peer's pointers: your messages with seq <= these are delivered / seen. */
  peerDeliveredUpTo: number;
  peerSeenUpTo: number;
  unreadCount: number;
}

export interface ConversationsResponse {
  conversations: ConversationSummary[];
}

export interface SendMessageBody {
  clientMessageId: string;
  text: string;
}

export interface SendMessageResponse {
  message: Message;
  /** True when this clientMessageId had already been stored (a retry). */
  duplicate: boolean;
}

/**
 * GET /conversations/:id/messages
 *  - `before=<seq>`: older page, newest first (scrolling back through history)
 *  - `after=<seq>`: newer messages, oldest first (sync after reconnect)
 */
export interface MessagesPage {
  messages: Message[];
  /** Pass as `before`/`after` to continue in the same direction; null when there is no more. */
  nextCursor: number | null;
}

export interface ReceiptBody {
  upToSeq: number;
}

// ----- Presence -----

export interface Presence {
  userId: string;
  online: boolean;
  /** ISO time; null if never seen or hidden. */
  lastSeenAt: string | null;
}

export interface PresenceResponse {
  presence: Presence[];
}
