# Anime — foundation

Monorepo (npm workspaces):

| Path                    | What                                                                          |
| ----------------------- | ----------------------------------------------------------------------------- |
| `apps/server`           | Fastify + TypeScript API: auth, age gate, phone OTP, account deletion         |
| `apps/mobile`           | Expo (SDK 58) + Expo Router app: welcome, age gate, sign up, log in, settings |
| `packages/shared-types` | API request/response types shared by both (types only)                        |
| `packages/scene-engine` | Placeholder, intentionally empty                                              |
| `docker-compose.yml`    | PostgreSQL 16 + Redis 7 (also creates the `anime_test` database)              |

## Prerequisites

- Node.js 20+ (developed on Node 26)
- Docker Desktop
- Expo Go on your phone (SDK 58), or an Android emulator / iOS simulator

## Run it

```bash
npm install
```

```bash
copy .env.example apps\server\.env
```

(`cp .env.example apps/server/.env` on macOS/Linux.)

```bash
npm run db:up
```

```bash
npm run dev:server
```

The server runs migrations on startup and listens on `http://0.0.0.0:3000`.

```bash
npm run dev:app
```

Scan the QR code with Expo Go. The app talks to port 3000 on the machine running Metro,
so your phone must be on the same Wi-Fi network (and Windows Firewall must allow Node on port 3000).
To point it elsewhere, set `EXPO_PUBLIC_API_URL` before `npm run dev:app`.

### Acceptance walkthrough

1. **Create account** → enter a birth date 18 years ago → pick a username/password → Home shows **Adult account**.
2. Settings → **Log out**. **Create account** → a birth date 15 years ago → Home shows **Teen account**.
3. Log out. **Create account** → a birth date 10 years ago → "Sorry, you can't create an account right now."
   Going back and entering an adult birth date on the same device is still blocked for 24 hours
   (`AGE_GATE_COOLDOWN_HOURS`).

To retry the under-13 case on the same device during development, clear the block:

```bash
docker compose exec postgres psql -U anime -d anime -c "TRUNCATE age_gate_blocks"
```

and clear the app's storage (or reinstall Expo Go's copy of the app).

## Scripts (root)

| Script                      | Does                                             |
| --------------------------- | ------------------------------------------------ |
| `npm run db:up` / `db:down` | Start / stop Postgres + Redis                    |
| `npm run db:migrate`        | Apply migrations (server also does this on boot) |
| `npm run dev:server`        | API with reload (`tsx watch`)                    |
| `npm run dev:app`           | Expo dev server                                  |
| `npm test`                  | Jest + Supertest suite (needs Postgres up)       |
| `npm run typecheck`         | `tsc --noEmit` in every workspace                |
| `npm run lint` / `format`   | ESLint (flat config) / Prettier                  |

Tests use `TEST_DATABASE_URL` (default `postgres://anime:anime@localhost:5432/anime_test`).
Set `TEST_REDIS_URL=redis://localhost:6379` to also run the Redis-backed rate-limit test.

## API

All requests from the app send `x-device-id` (a random per-install UUID kept in SecureStore).
Errors are `{ "error": { "code", "message" } }`.

| Method | Path                | Auth   | Notes                                                                               |
| ------ | ------------------- | ------ | ----------------------------------------------------------------------------------- |
| POST   | `/age-gate`         | —      | `{birthYear, birthMonth, birthDay}` → `{ageToken, ageBracket}` or 403 `AGE_BLOCKED` |
| POST   | `/auth/signup`      | —      | `{username, password, ageToken}` → tokens + user                                    |
| POST   | `/auth/login`       | —      | `{username, password}` → tokens + user                                              |
| POST   | `/auth/refresh`     | —      | `{refreshToken}` → new tokens (rotating)                                            |
| POST   | `/auth/logout`      | Bearer | Revokes this session                                                                |
| POST   | `/auth/logout-all`  | Bearer | Revokes every session for the user                                                  |
| GET    | `/me`               | Bearer | Current user                                                                        |
| DELETE | `/me`               | Bearer | `{password}` → deletes the account and all its data                                 |
| POST   | `/auth/otp/request` | Bearer | `{phone}` (E.164) → sends a code via the SMS provider                               |
| POST   | `/auth/otp/verify`  | Bearer | `{phone, code}` → marks the phone verified                                          |

Every route except `GET /me` is rate limited per IP, per route (`AUTH_RATE_LIMIT_MAX` per
`AUTH_RATE_LIMIT_WINDOW_MS`, default 10/min). Counters live in Redis when `REDIS_URL` is set,
otherwise in memory.

### Friends and chat (M2)

| Method | Path                                                             | Notes                                                                          |
| ------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/users/by-username/:username`                                   | Exact match only (case-insensitive); returns `{id, username}`                  |
| GET    | `/friends`                                                       | Accepted friends, each with its direct `conversationId`                        |
| GET    | `/friends/requests`                                              | Pending requests, `incoming` / `outgoing`                                      |
| POST   | `/friends/requests`                                              | `{username}` or `{qrToken}`. If they already asked you, this accepts           |
| POST   | `/friends/requests/:userId/accept`                               | Accept an incoming request                                                     |
| DELETE | `/friends/requests/:userId`                                      | Decline incoming / cancel outgoing                                             |
| DELETE | `/friends/:userId`                                               | Unfriend (history stays, sending stops)                                        |
| GET    | `/friends/qr`                                                    | Short-lived signed token to show as a QR code                                  |
| GET    | `/blocks` · POST `/blocks` `{userId}` · DELETE `/blocks/:userId` | Block list. Blocking ends any friendship/request                               |
| GET    | `/conversations`                                                 | Chat list with peer, last message, unread count, read pointers, `canSend`      |
| GET    | `/conversations/:id/messages`                                    | `?before=<seq>` older page (newest first) · `?after=<seq>` sync (oldest first) |
| POST   | `/conversations/:id/messages`                                    | `{clientMessageId, text}`. Idempotent: a retry returns the stored message      |
| POST   | `/conversations/:id/delivered`                                   | `{upToSeq}` moves your delivered pointer forward                               |
| POST   | `/conversations/:id/seen`                                        | `{upToSeq}` moves your seen pointer forward                                    |
| GET    | `/presence?userIds=a,b`                                          | Online / last seen, for friends only                                           |
| GET    | `/ws`                                                            | WebSocket gateway (below)                                                      |

**WebSocket protocol** (types in `packages/shared-types/src/realtime.ts`). The first frame must be
`{type:'auth', token}` within 5 s (else close 4408; bad token 4401). The server replies `ready`, then
pushes `message`, `receipt`, `presence` and `friends.changed`. Clients may send `ping`, `send`,
`delivered` and `seen`. The server pings every `HEARTBEAT_INTERVAL_MS` (25 s) and terminates sockets
that miss a round; each round also re-checks the session (logout closes the socket with 4401) and
refreshes presence. Frames from one socket are processed in order and rate limited (token bucket).
With `REDIS_URL` set, events fan out across server instances over Redis pub/sub.

## Design notes

**Data minimisation.** The age gate takes a full date of birth to compute an exact age, then
discards it. Only `birth_year` and `age_bracket` (`teen` | `adult`) are stored. Device ids,
refresh tokens and OTP codes are stored only as hashes.

**Age gate.** The screen is neutral: empty fields, no mention of a minimum age, and the same
generic message for every block. An under-13 answer writes a `age_gate_blocks` row keyed by the
device hash; while it is active, every age-gate attempt and every signup from that device is
refused regardless of the age entered, including signups using an age token obtained
_before_ the block. Age tokens are short-lived (15 min) JWTs bound to the device hash. The
age-gate route is rate limited per IP, so cycling device ids doesn't allow unlimited guessing.

Known limit: a determined user who wipes app storage _and_ changes IP can get a new device id.
On iOS the Keychain usually survives reinstalls; stronger options (Play Integrity / App Attest
device attestation) are a later milestone.

**Tokens.** Access tokens are 15-minute HS256 JWTs carrying the session id; every authenticated
request checks the session is still live, so logout, logout-all and deletion take effect
immediately. Refresh tokens are opaque 256-bit values. Each refresh revokes the old session
(`rotated`) and issues a new one; presenting a rotated token again is treated as theft and
revokes all of the user's sessions.

**Passwords.** argon2id (19 MiB, t=2, p=1). Login against an unknown username still runs a
hash verification so timing doesn't reveal which usernames exist.

**Account deletion.** Every user-data table references `users(id) ON DELETE CASCADE`
(credentials, devices, sessions, OTP codes, reports filed by _or about_ the user), so one
`DELETE` removes everything atomically. The age-gate block table holds no user data and is not
linked to accounts.

**Phone OTP.** `SmsProvider` interface (`apps/server/src/sms/provider.ts`) with a dev stub that
logs the code to the server console. Codes are 6 digits, expire in 10 minutes, allow 5 attempts,
and only the latest code is valid. Add a real provider by implementing `send()` and extending
`SMS_PROVIDER`.

**Teens.** `age_bracket = 'teen'` for 13–17 is returned on the user as `isTeen` for later
feature gating. The bracket is fixed at signup; re-deriving it from `birth_year` as users age
is a follow-up.

**Friends.** A friendship is one row per pair, `pending` until the other side accepts. There is
no search or suggestion feature for anyone: the only ways to reach a person are their exact
username or their QR code (a 10-minute signed token), which is what teens are limited to. Any
future discovery feature must go through `canUseStrangerDiscovery()` in
`apps/server/src/services/social.ts`, which allows adults only. Lookups return only id and
username. "Not found", "is you" and "blocked" all return the same 404, so a block can't be
detected.

**Messages.** Each message gets a per-conversation `seq` allocated under a row lock, so order is
total and gap-free. `UNIQUE (sender_id, client_message_id)` makes sends idempotent: retries
(over HTTP or the socket, even concurrent ones) return the stored message and are never
re-broadcast. There is no edit or delete; messages go away only if the sender deletes their
account. `anime_scene` (JSONB) is reserved and always null for now.

**Delivery states.** Each member has `delivered_up_to` and `seen_up_to` pointers that only move
forward; moving one also upgrades `messages.status` (`sent` → `delivered` → `seen`) and pushes a
`receipt` to the conversation. Clients draw ticks from the peer's pointers.

**Mobile offline queue.** A message is written to an on-device outbox (AsyncStorage) _before_
any network call, then sent over HTTP in order with exponential backoff, and removed only after
the server confirms it. After a crash or app kill it resumes from storage. Retries reuse the
same `clientMessageId`, so they can't duplicate. A permanent refusal (e.g. no longer friends)
parks the message as failed with Retry / Delete, and nothing is dropped silently. After every
(re)connect the app refetches the chat list, pulls `?after=<last seq>` for each conversation,
sends delivered receipts, then flushes the outbox. The socket reconnects with exponential
backoff plus jitter (1 s → 30 s), sends an app-level ping every 20 s, and treats 10 s of
silence as a dead connection.

**Presence.** Online = a heartbeat within `PRESENCE_TTL_SECONDS` (60 s), stored as a Redis key
with a TTL (in-memory fallback without Redis). Only friends can see it. Turning off last seen
(M6) plugs into `GET /presence` and the `presence` event.
