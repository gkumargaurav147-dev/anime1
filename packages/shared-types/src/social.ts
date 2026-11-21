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

/**
 * Scene attached to a message (the scene-engine `Scene` JSON). The server validates it against
 * the scene schema and stores null when it is invalid — the text is always kept.
 */
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

/**
 * The message payload as named in the product spec. On the wire the API uses camelCase like
 * every other endpoint (`Message` above); each field notes its `Message` counterpart.
 */
export interface MessagePayload {
  message_id: string; // Message.id
  sender_id: string; // Message.senderId
  text: string; // Message.text
  anime_scene: AnimeScene; // Message.animeScene
  timestamp: string; // Message.createdAt (ISO 8601)
  status: MessageStatus; // Message.status
}

export interface SendMessageBody {
  clientMessageId: string;
  text: string;
  /** Optional scene; generated on the sender's device (no text leaves for any AI service). */
  animeScene?: AnimeScene;
}

/** Why a submitted scene was not stored (the message text is stored regardless). */
export type SceneDropReason = 'invalid' | 'too_large' | 'age_restricted';

export interface SendMessageResponse {
  message: Message;
  /** True when this clientMessageId had already been stored (a retry). */
  duplicate: boolean;
  /** Set when an attached scene was dropped; the message was still sent as text. */
  sceneDropped?: SceneDropReason | null;
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

// ----- Avatars (M5) -----

/**
 * Avatar option ids (face shape, skin tone, hair…). The authoritative schema and option lists
 * live in @anime/scene-engine (AvatarConfigSchema); this is the wire shape.
 */
export type AvatarConfigJson = { version: number } & Record<string, string | number>;

export interface AvatarResponse {
  userId: string;
  avatar: AvatarConfigJson | null;
  updatedAt: string | null;
}

export interface AvatarsResponse {
  avatars: { userId: string; avatar: AvatarConfigJson; updatedAt: string }[];
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
