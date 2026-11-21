-- M2: friends, blocks, direct conversations, permanent messages.

-- One row per unordered pair (user_low < user_high). A pending row means
-- `requested_by` asked and the other side has not accepted yet.
CREATE TABLE friendships (
  user_low      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('pending', 'accepted')),
  requested_by  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  PRIMARY KEY (user_low, user_high),
  CHECK (user_low < user_high),
  CHECK (requested_by IN (user_low, user_high))
);
CREATE INDEX friendships_high_idx ON friendships (user_high);

CREATE TABLE blocks (
  blocker_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id);

CREATE TABLE conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct')),
  -- "<low uuid>:<high uuid>" for direct chats, so a pair has exactly one conversation.
  direct_key       text UNIQUE,
  -- Per-conversation message counter; bumped under a row lock to allocate seq numbers.
  last_seq         bigint NOT NULL DEFAULT 0,
  last_message_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_members (
  conversation_id     uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Read/delivery pointers: every message with seq <= pointer is delivered/seen by this member.
  delivered_up_to     bigint NOT NULL DEFAULT 0,
  seen_up_to          bigint NOT NULL DEFAULT 0,
  joined_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON conversation_members (user_id);

-- Messages are permanent: there is no edit or delete endpoint. They are removed only when
-- the sender deletes their account (all of a user's data goes with it).
CREATE TABLE messages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seq                bigint NOT NULL,
  sender_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Client-generated id; makes retries idempotent.
  client_message_id  text NOT NULL,
  text               text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 4000),
  anime_scene        jsonb,
  status             text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'seen')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, seq),
  UNIQUE (sender_id, client_message_id)
);
