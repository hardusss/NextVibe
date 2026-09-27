# NextVibe API (Django)

The REST API behind the app, the website's share pages and the organizer dashboard: accounts,
posts and the feed, events and check-in, Tap to Meet and Proof of Meet, collectibles, wallet
history and chat lists. Celery runs the background work (moderation, the mint queue,
reminders), and `manage.py nv` opens the push and email console
([nvcli/README.md](nvcli/README.md)).

- Endpoint list: [docs/API.md](../../docs/API.md)
- How it fits with the other services: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)

## Apps

| App | What |
|---|---|
| `user` | Accounts, sign-in (email, Google, Apple, wallet), profiles, follows, blocking, notifications, push tokens, Seeker Verified, share cards |
| `posts` | Posts and the feed, moderation, events (Luma import, requests, check-in, analytics), Tap to Meet, Proof of Meet, collect and publish, collectibles and the mint queue |
| `chat` | Chat lists and the Cherry group chat (messages go through `socket_service`) |
| `wallet` | Transaction history (read from the tx-indexer's table), token prices, the Solana RPC proxy |
| `nvcli` | The `nv` console for push and email campaigns (not an installed app) |

## How it talks to the other services

| To | How |
|---|---|
| MySQL | Django ORM (`DB_*`) |
| Redis | Celery broker and results (db 0), cache and rate limits (db 1), in-app events on the socket service's pub/sub channel (`REALTIME_REDIS_URL`) |
| Cloudflare R2 | Media storage (`R2_*`, `BUCKET_NAME`); Proof of Meet selfies in a private bucket (`R2_PRIVATE_BUCKET_NAME`) |
| nft-service | HTTP to `NFT_SERVICE_URL`: `/mint`, `/mint/meet`, `/mint/og`, `/collect/prepare`, `/collect/submit`, `/tree`, `/seeker/sgt-check`, `/asset-id-from-signature` |
| moderation_service | HTTP to `http://127.0.0.1:8080/moderation`; results come back on `/api/v1/posts/moderation-callback/` |
| tx-indexer | HTTP to `INDEXER_URL` with `x-internal-secret`; the indexer calls `/api/v1/wallets/webhook-notify/` |
| Helius | DAS lookups for minted collectibles and the `/api/v1/wallets/rpc/` proxy (`HELIUS_API_KEY`) |
| Resend, Expo | Email over Resend's HTTP API, push through Expo |

## Run it

Running the API needs MySQL, Redis, an R2 bucket and the keys below; for trying NextVibe,
use the production API instead (see the root README).

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r modules.txt          # mysqlclient needs the MySQL client libraries
cd NextVibeAPI
cp .env.example .env                # fill it in
```

Migrations are not committed (see `backend/.gitignore`), apart from three that depend on files
only the production host has. For a new database, remove those three, then generate and apply
the rest:

```bash
rm user/migrations/0002_*.py user/migrations/0003_*.py chat/migrations/0003_*.py
python manage.py makemigrations user posts chat wallet
python manage.py migrate
python manage.py runserver
```

The `transactions` table belongs to the tx-indexer: create it with
`tx-indexer/migrations/001_create_tables.sql`.

Background workers (each in its own terminal):

```bash
celery -A NextVibeAPI worker -l info
celery -A NextVibeAPI beat -l info
```

## Environment variables

Listed in [.env.example](.env.example), with defaults.

| Variable | Required | Purpose |
|---|---|---|
| `DJANGO_ENV` | prod: `prod` | "prod" loads NextVibeAPI/setting/prod.py (DEBUG off, hosts and CORS from env); anything else loads setting/dev.py |
| `SECRET_KEY` | yes | Django secret key; also signs JWTs and meet slugs. socket_service's JWT_SECRET_KEY must hold the same value |
| `ALLOWED_HOSTS` | prod | prod only: comma-separated host names the API answers on |
| `CORS_ALLOWED_ORIGINS` | prod, for the web apps | prod only: comma-separated origins allowed by CORS |
| `PUBLIC_API_URL` | no | Absolute base for image URLs in share cards (default https://api.nextvibe.io) |
| `PUBLIC_MEDIA_URL` | no | Public base URL of stored media; empty means https://<CUSTOM_DOMAIN> |
| `DB_NAME` | yes | MySQL database name (dev and prod settings both use MySQL) |
| `DB_USER` | yes | MySQL user |
| `DB_PASSWORD` | yes | MySQL password |
| `DB_HOST` | yes | MySQL host |
| `DB_PORT` | yes | MySQL port |
| `R2_ACCESS_KEY_ID` | yes | Cloudflare R2 access key id (S3 API), used for all media |
| `R2_SECRET_ACCESS_KEY` | yes | Cloudflare R2 secret access key |
| `BUCKET_NAME` | yes | Public media bucket name |
| `ENDPOINT_URL` | yes | R2 S3 endpoint host, without https:// (the settings add it) |
| `CUSTOM_DOMAIN` | yes | Public domain that serves the media bucket |
| `R2_PRIVATE_BUCKET_NAME` | for selfies | Private bucket for Proof of Meet selfies; empty turns selfies off (uploads answer 503) |
| `MEET_PHOTO_LOCAL_DIR` | no | Local runs only: keep selfies in this directory instead of the private bucket |
| `CLOUD_NAME` | no | Cloudinary cloud name (legacy: only old posts still point at res.cloudinary.com) |
| `API_KEY` | no | Cloudinary API key (legacy) |
| `API_SECRET` | no | Cloudinary API secret (legacy) |
| `REALTIME_REDIS_URL` | no | socket_service's Redis; Django publishes in-app events on its pub/sub channel (default redis://127.0.0.1:6379/0) |
| `HELIUS_API_KEY` | for collectibles and the RPC proxy | Helius API key: DAS lookups for minted collectibles, the /api/v1/wallets/rpc/ proxy, check_balances |
| `NFT_SERVICE_URL` | no | nft-service base URL (default http://localhost:3000) |
| `INDEXER_URL` | no | tx-indexer base URL (default http://localhost:3000; give the two services different ports) |
| `INDEXER_INTERNAL_SECRET` | for wallet history | Shared secret sent as x-internal-secret to tx-indexer; must equal its INTERNAL_SECRET |
| `COLLECTIBLES_DAILY_MINT_CAP` | no | Global cap on queued collectible mints per UTC day, in-flight ones included (default 5000) |
| `COLLECTIBLES_USER_BATCH_CAP` | no | Max collectibles one person's queue run puts on-chain (default 200) |
| `COLLECTIBLES_MINT_PAUSE` | no | Seconds between two queued mints (default 0.2) |
| `EMAIL_BACKEND` | no | Django email backend (default nvcli.email_backend.ResendBackend; the server can't use SMTP) |
| `RESEND_API_KEY` | for email | Resend API key for all email |
| `RESEND_WEBHOOK_SECRET` | for email stats | Signing secret of the Resend webhook behind /api/v1/nv/resend-webhook/; empty rejects every call |
| `DEFAULT_FROM_EMAIL` | no | From address for email |
| `EXPO_ACCESS_TOKEN` | no | Optional Expo access token for push sends from the nv console (nvcli/send_push.py) |
| `MAPBOX_ACCESS_TOKEN` | no | Mapbox token for reverse geocoding (meet city); without it the API uses OpenStreetMap Nominatim |
| `MAPBOX_TOKEN` | no | Older name for the same Mapbox token, read when MAPBOX_ACCESS_TOKEN is empty |
| `REPLICATE_API_TOKEN` | for AI images | Replicate API token for AI image generation in posts |
| `CHERRY_APP_ID` | for the Cherry chat | Cherry group chat app id (chat/views_cherry.py) |
| `CHERRY_APP_SECRET` | for the Cherry chat | Cherry app secret; signs the chat embed tokens (HS256) |
| `CHERRY_PROJECT_KEY` | for the Cherry chat | Cherry project key, Bearer for Cherry's group API (member list) |
| `ETH_RPC_LINK` | no | Ethereum RPC URL for the legacy fee estimate endpoint (/api/v1/wallets/fee/) |
| `RPC_KEY` | no | Fallback Helius key for the check_balances command when HELIUS_API_KEY is empty |

## Tests

The Django test runner, about 440 tests in `posts/tests/`, `user/tests*.py`, `chat/tests.py`
and `nvcli/tests/`. They run on SQLite with a small settings module that builds the tables
straight from the models. Put this next to `manage.py` as `test_settings.py`:

```python
from NextVibeAPI.settings import *  # noqa

SECRET_KEY = "test"
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": "test.sqlite3"}}
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}


class _NoMigrations(dict):
    def __contains__(self, item):
        return True

    def __getitem__(self, item):
        return None


MIGRATION_MODULES = _NoMigrations()
```

```bash
DJANGO_SETTINGS_MODULE=test_settings python manage.py test posts user chat nvcli
```

`mysqlclient` isn't needed for the tests; Python 3.12 is what the suite runs on.

## Main files

| File | What |
|---|---|
| `NextVibeAPI/settings.py`, `setting/prod.py`, `setting/dev.py` | Settings; `DJANGO_ENV=prod` picks production |
| `NextVibeAPI/urls.py`, `*/urls.py` | Routes |
| `NextVibeAPI/celery.py`, `posts/tasks.py` | Celery app and tasks, beat schedule in the settings |
| `user/auth.py` | JWT authentication |
| `posts/view_pac/`, `user/views_pac/` | Views |
| `posts/src/` | Collectibles and the mint queue, meets and cards, moderation, metadata |
