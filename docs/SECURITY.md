# Security

## Reporting a vulnerability

Email **dklepar29@gmail.com** with the steps to reproduce and what an attacker could do.
Please don't open a public GitHub issue for security problems, and give us time to fix the
issue before you disclose it.

TODO(founder): confirm this address or replace it with a dedicated security mailbox.

## Accounts and sessions

- The API uses JWTs (`djangorestframework-simplejwt`): access tokens last 1 hour, refresh
  tokens 90 days and rotate on refresh. Tokens of deactivated or deleted accounts are
  rejected on every request (`backend/NextVibeAPI/user/auth.py`).
- Sign-in methods: email and password; Google (the ID token is verified and the email must
  be verified); Apple (the identity token is checked against Apple's keys, issuer, audience
  and expiry); Solana wallets (Mobile Wallet Adapter wallets sign a sign-in message; passkey
  wallets through LazorKit).
- Optional TOTP two-factor authentication confirms password changes.
- Rate limits are set per endpoint (for example sign-in 10/min per IP, collect 30/min per
  user); see `REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]` in
  `backend/NextVibeAPI/NextVibeAPI/setting/prod.py`.

## What's public

- Posts become public only after moderation approves them. Public endpoints (share pages,
  link-preview cards, the public profile) return an explicit list of fields.
- Blocking hides two people from each other everywhere, and a tap between them is refused
  without showing the name.
- Wallet addresses are public on-chain. Each Proof of Meet cNFT names both people's wallets
  as creators on purpose: that's the proof.

## Proof of Meet selfies

- Uploads have their EXIF data removed and are re-encoded, checked by moderation, and kept in
  a private Cloudflare R2 bucket. The app reads them through signed URLs that expire after
  10 minutes.
- Nothing is shared until the other person approves, and either person can take the photo
  down at any time.

## Chats and encryption

- Chats go over TLS to the socket service, which checks the same JWT as the API. The app
  encodes message text into an envelope before sending, and the server stores the envelope.
- **This is not end-to-end encryption:** the server can read chat content and media. The
  socket service has device key endpoints for end-to-end encryption (identity key, signed
  prekey, one-time prekeys in `socket_service/src/keys.py`); the app doesn't use them yet.
- Push notifications for chat messages don't include the message text.
- [E2EE_MODERATION_POLICY.md](E2EE_MODERATION_POLICY.md) sets out the end-to-end encryption
  design and how moderation works with it. Where it differs from the code, this page describes
  the code.

## Moderation

- Public posts (text and media) and Proof of Meet selfies and captions are checked with OpenAI
  `omni-moderation-latest` by `moderation_service`. Rejected posts notify their author; posts
  can be reported from the app.
- Chats are not scanned.

## Keys and minting

- Configuration and keys come from environment variables. Each service has a `.env.example`
  with variable names and no values.
- The Solana fee payer key exists only in nft-service's environment, and only the API and its
  workers call nft-service.
- Backend-paid mints are bounded: one POAP per person per event, one Proof of Meet per pair
  per day (outside events) or per event, 10 collects and 20 publishes per person per UTC day,
  per-user rate limits on every endpoint that can trigger a mint, a global daily cap on queued
  mints (`COLLECTIBLES_DAILY_MINT_CAP`), and a tree-capacity check before every batch.
