-- M5: each user's avatar. Only option ids (no photos, no face data). Deleted with the account.
CREATE TABLE avatars (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  config      jsonb NOT NULL,
  -- Avatar model version the config was written against (see packages/scene-engine).
  version     smallint NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
