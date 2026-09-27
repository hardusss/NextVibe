# socket_service

The realtime service behind NextVibe chats (FastAPI). It holds the app's WebSocket
connections, stores and delivers chat messages, receipts, reactions and typing, sends a push to
people who are offline, and delivers in-app events the API publishes (Proof of Meet selfies,
collectibles landing on Solana).

## How it fits in

- **App → service:** `wss://realtime.nextvibe.io/ws?token=<access token>` and REST routes under
  `https://realtime.nextvibe.io/api/v2` with `Authorization: Bearer <access token>`.
- **Auth:** the API's JWTs, checked with PyJWT (HS256) against `JWT_SECRET_KEY`, which must equal
  the API's `SECRET_KEY`; only access tokens are accepted. A bad token closes the socket with
  code 4401; more than 5 connections per user closes it with 4408.
- **MySQL:** reads and writes the API's chat and user tables directly with SQLAlchemy (`chat_*`,
  `user_user`, `user_block`, `user_useronlinesession`), including online status.
- **Redis:** pub/sub channel `chat_pubsub_events` fans events out across instances; the API
  publishes its `meet_photo` and `collectible` events on the same channel. Presence, typing and
  a per-user limit of `MAX_EVENTS_PER_SECOND` events live in Redis too.
- **R2:** chat media in the public bucket under `chat_media/`, uploaded inline or through a
  presigned URL.
- **Expo:** push to offline recipients; the notification doesn't include the message text.

## WebSocket and REST

Socket events (`main.py`): messages (deduplicated by `client_msg_id`), read receipts,
reactions, typing, edits within 15 minutes, deletes, and relayed WebRTC signalling.

| Method | Path (under `/api/v2`) | What |
|---|---|---|
| GET | `/messages/{chat_id}` | Chat history |
| POST | `/messages/chat/{chat_id}/read`, `/messages/{chat_id}/mark-read` | Mark messages read |
| POST, DELETE | `/messages/{message_id}/reactions`, `/messages/{message_id}/reactions/{emoji}` | Add or remove a reaction |
| PATCH, DELETE | `/messages/{message_id}` | Edit or delete a message |
| POST | `/media/upload-url` | Presigned upload URL for chat media |
| POST | `/keys/register-device` | Register a device's identity key, signed prekey and one-time prekeys |
| GET | `/keys/prekey/{target_user_id}` | A user's prekey bundle (consumes one one-time prekey per device) |
| POST | `/chat/report-message` | Checks chat membership and acknowledges the report; nothing is stored |

The app doesn't call the `/keys/*` routes yet; see [docs/SECURITY.md](../docs/SECURITY.md#chats-and-encryption).

## Run it

There's no separate requirements file: its dependencies are pinned in `backend/modules.txt`
(FastAPI, SQLAlchemy, PyMySQL, PyJWT, pydantic-settings, redis, boto3).

```bash
cd socket_service
cp .env.example .env                        # JWT_SECRET_KEY and the database at least
uvicorn main:app --reload --port 8001       # the API uses 8000 in development
```

In production it runs as the `nextvibe-realtime` systemd unit behind `realtime.nextvibe.io`
(the unit file isn't in this repository).

## Environment variables

Listed in [.env.example](.env.example). `config.py` reads the first group through
pydantic-settings; the rest are read directly.

| Variable | Required | Purpose |
|---|---|---|
| `ENVIRONMENT` | no | "production" turns on real R2 object checks (default development) |
| `LOG_LEVEL` | no | Log level (default INFO) |
| `REDIS_HOST` | no | Redis host for connections, pub/sub and rate limits (default 127.0.0.1) |
| `REDIS_PORT` | no | Redis port (default 6379) |
| `REDIS_DB` | no | Redis database number (default 0) |
| `MAX_MEDIA_SIZE_MB` | no | Largest chat media upload in MB (default 100) |
| `MAX_CONNECTIONS_PER_USER` | no | Open sockets allowed per user (default 5) |
| `MAX_TEXT_LENGTH` | no | Longest message text in characters (default 10000) |
| `MAX_EVENTS_PER_SECOND` | no | Events one user may send per second (default 10) |
| `CORS_ORIGINS` | no | Comma-separated CORS origins (default none) |
| `POD_ID` | no | Name of this instance for cross-pod routing (default pod-<random>) |
| `JWT_SECRET_KEY` | yes | Verifies the API's JWTs; must equal the API's SECRET_KEY |
| `JWT_ALGORITHM` | no | JWT algorithm (default HS256) |
| `DATABASE_URL` | yes, or the DB_* keys | SQLAlchemy URL of the API's MySQL database; when empty it is built from the DB_* keys |
| `DB_HOST` | no | MySQL host (default localhost) |
| `DB_PORT` | no | MySQL port (default 3306) |
| `DB_USER` | no | MySQL user (default root) |
| `DB_PASSWORD` | no | MySQL password (default empty) |
| `DB_NAME` | no | MySQL database (default nextvibe) |
| `ENDPOINT_URL` | for chat media | Cloudflare R2 endpoint host, without https:// |
| `R2_ACCESS_KEY_ID` | for chat media | Cloudflare R2 access key id |
| `R2_SECRET_ACCESS_KEY` | for chat media | Cloudflare R2 secret access key |
| `BUCKET_NAME` | for chat media | Media bucket for chat uploads |
| `CUSTOM_DOMAIN` | no | Public domain of the media bucket (default media.nextvibe.io) |

## Tests

pytest with FastAPI's `TestClient` and a SQLite file per test module. Each module sets its
database at import time, so run one file per process, from the service folder, with a Redis
that is flushed between files:

```bash
python -m venv .venv && . .venv/bin/activate
pip install fastapi sqlalchemy redis pydantic-settings python-dotenv pyjwt boto3 httpx pytest pytest-asyncio websockets pymysql
redis-server --port 6390 --save "" --daemonize yes
for t in tests/test_*.py; do redis-cli -p 6390 flushall; REDIS_PORT=6390 JWT_SECRET_KEY=test python -m pytest -q "$t"; done
```

On Sep 27, 2026 this ran 22 tests: 19 pass. `test_presigned_media_upload_flow` needs R2
credentials, `test_cross_pod_pubsub_routing` expects a Redis on port 6379, and
`test_push_notification_dispatch_for_offline_user` fails.

## Files

| File | What |
|---|---|
| `main.py` | FastAPI app, the `/ws` WebSocket, routers under `/api/v2` |
| `connection_manager.py` | Connections, presence, pub/sub, rate limits |
| `auth.py` | JWT check |
| `db.py`, `src/models/` | SQLAlchemy engine and models of the shared tables |
| `src/messages.py`, `src/keys.py`, `src/notifications.py` | REST routes, key routes, Expo push |
| `r2_storage.py` | Chat media on R2 |
| `config.py` | Settings |
