# NextVibe Transaction Indexer

Bun + Elysia microservice that indexes Solana wallet transactions via Helius and stores them in the shared MySQL database used by Django.

## Prerequisites

- Bun >= 1.1
- Redis (BullMQ queue)
- MySQL (same database as Django)
- Helius API key with Enhanced Transactions + Webhooks

## Setup

```bash
cd tx-indexer
cp .env.example .env
# Fill in .env values

bun install
```

Create database tables:

```bash
mysql -u root -p your_database < migrations/001_create_tables.sql
```

## Development

```bash
bun run dev
```

## Production

### PM2

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
```

### systemd

Copy `deploy/tx-indexer.service` to `/etc/systemd/system/`, adjust paths, then:

```bash
sudo systemctl enable tx-indexer
sudo systemctl start tx-indexer
```

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Health check (MySQL + Redis) |
| POST | `/index/register` | `x-internal-secret` | Register wallet for indexing |
| POST | `/index/load-more` | — | Load older transactions |
| POST | `/webhook/helius` | HMAC signature | Helius realtime webhook |

## Django integration

Set in backend `.env`:

```bash
INDEXER_URL=http://localhost:3000
INDEXER_INTERNAL_SECRET=same_as_INTERNAL_SECRET_in_indexer
```

Django automatically calls `/index/register` when a user saves a wallet address.

## Helius webhook

1. Create an enhanced webhook pointing to `HELIUS_WEBHOOK_URL`
2. Save `HELIUS_WEBHOOK_ID` and `HELIUS_WEBHOOK_SECRET` in `.env`
3. The service dynamically adds wallet addresses to the webhook pool
