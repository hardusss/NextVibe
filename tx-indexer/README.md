# tx-indexer

Bun + Elysia service that keeps NextVibe users' Solana wallet history. It fetches
transactions from the Helius Enhanced Transactions API, stores them in the API's MySQL
database, keeps a Helius webhook's address list in sync with the wallets people link, and
tells the API when a new transaction arrives so the owner gets a notification.

## How it fits in

| Direction | What |
|---|---|
| API → indexer | `POST /index/register` when someone links a wallet, `POST /index/load-more` and `POST /index/refresh-latest` for the history screen, `POST /index/sync-all` from `manage.py sync_wallets_to_indexer`. The API sends `x-internal-secret` (`INDEXER_INTERNAL_SECRET` = this service's `INTERNAL_SECRET`). |
| Helius → indexer | `POST /webhook/helius` with the enhanced webhook's `Authorization: Bearer <HELIUS_WEBHOOK_SECRET>`, compared in constant time |
| Indexer → Helius | `api.helius.xyz/v0/addresses/<address>/transactions` for history; `/v0/webhooks/<id>` to keep the monitored addresses in sync |
| Indexer → API | `POST <DJANGO_API_URL>/api/v1/wallets/webhook-notify/` with `x-internal-secret`; the API creates the notification and push |
| Indexer → MySQL | Writes `transactions` and `sync_cursors`, reads wallet addresses from the users table |
| Indexer → Redis | BullMQ queue `tx-fetch` (initial fetch, load more, webhook transactions; 3 attempts with back-off, 5 at a time, at most 8 jobs per second) |

A wallet that shows more than 50 transactions in an hour is treated as a bot and skipped for
48 hours (`src/services/bot-detector.ts`). Only successful transactions that involve the
wallet are kept (`src/services/transaction-filter.ts`).

## Endpoints

| Method | Path | Auth | What |
|---|---|---|---|
| GET | `/health` | — | MySQL and Redis status |
| POST | `/index/register` | `x-internal-secret` | Start indexing a wallet |
| POST | `/index/sync-all` | `x-internal-secret` | Register every linked wallet |
| GET | `/index/status` | `x-internal-secret` | Stored transaction count and the webhook's address count and URL |
| POST | `/index/load-more` | — | Fetch older transactions for a wallet (called by the API) |
| POST | `/index/refresh-latest` | — | Fetch the newest transactions for a wallet (called by the API) |
| POST | `/webhook/helius` | Bearer secret | Helius enhanced webhook |

## Run it

Needs Bun 1.1+, Redis, the API's MySQL database and a Helius API key with webhooks.

```bash
cd tx-indexer
bun install
cp .env.example .env                                   # fill it in
mysql -u <user> -p <database> < migrations/001_create_tables.sql
bun run dev                                            # or: bun run start
```

On a shared host give it its own `PORT`: nft-service already uses 3000.

Production: `deploy/nextvibe-indexer.service` is the systemd unit (`bun run src/index.ts` in
`/root/NextVibe/tx-indexer`, environment from `.env`); `deploy/nginx-indexer.conf` proxies
`indexer.nextvibe.io` to port 3003. `deploy/tx-indexer.service` and
`deploy/ecosystem.config.cjs` (PM2) are alternatives.

## Environment variables

Listed in [.env.example](.env.example).

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no | HTTP port (default 3000; nft-service also uses 3000, so pick another one on a shared host) |
| `NODE_ENV` | no | development \| production (default development) |
| `INTERNAL_SECRET` | yes | Shared secret checked on x-internal-secret and sent to Django; must equal the API's INDEXER_INTERNAL_SECRET |
| `MYSQL_URL` | yes, or the MYSQL_* keys | MySQL connection URL (the same database as Django); when empty, the MYSQL_* keys below are required |
| `MYSQL_HOST` | without MYSQL_URL | MySQL host, used when MYSQL_URL is empty |
| `MYSQL_PORT` | no | MySQL port (default 3306) |
| `MYSQL_USER` | without MYSQL_URL | MySQL user, used when MYSQL_URL is empty |
| `MYSQL_PASSWORD` | without MYSQL_URL | MySQL password, used when MYSQL_URL is empty |
| `MYSQL_DATABASE` | without MYSQL_URL | MySQL database, used when MYSQL_URL is empty |
| `MYSQL_SSL` | no | "true" turns on TLS to MySQL (default off) |
| `USERS_TABLE` | no | Django's users table (default user_user) |
| `REDIS_URL` | no | Redis URL for the job queue and cache; when empty, built from REDIS_HOST and REDIS_PORT |
| `REDIS_HOST` | no | Redis host (default localhost) |
| `REDIS_PORT` | no | Redis port (default 6379) |
| `HELIUS_API_KEY` | yes | Helius API key for fetching transactions and managing the webhook |
| `HELIUS_WEBHOOK_ID` | yes | Id of the Helius webhook this service keeps in sync with user wallets |
| `HELIUS_WEBHOOK_SECRET` | yes | Set on the Helius webhook as its auth header; incoming webhook calls must carry it |
| `HELIUS_WEBHOOK_URL` | yes | Public URL of this service's webhook endpoint, registered with Helius |
| `INITIAL_FETCH_LIMIT` | no | Transactions fetched when a wallet is first indexed (default 10) |
| `LOAD_MORE_DEFAULT_LIMIT` | no | Page size for "load more" (default 50) |
| `HELIUS_WEBHOOK_ADDRESS_LIMIT` | no | Max addresses kept on the Helius webhook (default 100 in src/services/webhook-manager.ts) |
| `DJANGO_API_URL` | no | Django API base URL; the worker posts wallet notifications to /api/v1/wallets/webhook-notify/ (default http://127.0.0.1:8000) |

## Files

| File | What |
|---|---|
| `src/index.ts` | Elysia app (API docs at `/swagger`), the queue worker, the initial sync on start |
| `src/routes/` | `index.route.ts`, `history.route.ts`, `refresh.route.ts`, `webhook.route.ts` |
| `src/queue/` | BullMQ queue and worker (stores transactions, notifies the API) |
| `src/services/` | Helius client, webhook address sync, bot detection, transaction filter |
| `src/db/` | MySQL and Redis connections, queries |
| `migrations/001_create_tables.sql` | `transactions` and `sync_cursors` |

## Tests

There are no tests. `bun run typecheck` runs `tsc --noEmit`.
