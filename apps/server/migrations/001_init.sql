-- Foundation schema: users, credentials, devices, sessions, age gate, OTP, reports.
-- Data minimisation: we keep birth year + age bracket only (never a full date of birth),
-- and device identifiers are stored as SHA-256 hashes.

CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username           text NOT NULL,
  birth_year         smallint NOT NULL CHECK (birth_year BETWEEN 1900 AND 2100),
  age_bracket        text NOT NULL CHECK (age_bracket IN ('teen', 'adult')),
  phone_e164         text,
  phone_verified_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
-- Usernames are unique case-insensitively.
CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));
CREATE UNIQUE INDEX users_phone_idx ON users (phone_e164) WHERE phone_e164 IS NOT NULL;

CREATE TABLE credentials (
  user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash  text NOT NULL,  -- argon2id encoded hash
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_hash   text NOT NULL,
  platform      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_hash)
);

CREATE TABLE sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id           uuid REFERENCES devices(id) ON DELETE CASCADE,
  refresh_token_hash  text NOT NULL UNIQUE,  -- SHA-256 of the opaque refresh token
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_used_at        timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  revoked_at          timestamptz,
  -- 'rotated' rows are kept so a replayed (stolen) refresh token can be detected.
  revoked_reason      text CHECK (revoked_reason IN ('rotated', 'logout', 'logout_all', 'reuse_detected'))
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Device-level age gate cooldown. Not linked to any user, holds no personal data.
CREATE TABLE age_gate_blocks (
  device_hash    text PRIMARY KEY,
  blocked_until  timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE otp_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_e164   text NOT NULL,
  code_hash    text NOT NULL,
  attempts     smallint NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_user_idx ON otp_codes (user_id);

-- Moderation reports. No endpoints yet.
CREATE TABLE reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id  uuid REFERENCES users(id) ON DELETE CASCADE,
  reason            text NOT NULL,
  details           text,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'closed')),
  created_at        timestamptz NOT NULL DEFAULT now()
);
