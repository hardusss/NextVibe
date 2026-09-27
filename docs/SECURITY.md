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
- Changing or resetting the password, and deleting the account, revoke every refresh token
  of the account, so other devices have to sign in again (`user/src/sessions.py`).
- Sign-in methods: email and password; Google (the ID token is verified and the email must
  be verified); Apple (the identity token is checked against Apple's keys, issuer, audience
  and expiry); Solana wallets (Mobile Wallet Adapter wallets sign a sign-in message; passkey
  wallets through LazorKit). A Mobile Wallet Adapter sign-in message is accepted for
  15 minutes and each signature only once. Email login gives the same answer for an unknown
  email and a wrong password.
- **Email codes** (`backend/NextVibeAPI/verification/`): six-digit codes sent by email. A
  code works for 10 minutes, allows 5 tries and works once; the server keeps only an HMAC of
  it. Each address gets at most one code a minute, 5 an hour and 10 a day.
  - Password reset: `password/forgot/` then `password/reset/` with the code. The answer to
    `password/forgot/` is the same whether or not an account has the email. A reset signs
    out every other device and confirms the email.
  - Email confirmation: with `EMAIL_VERIFICATION_REQUIRED=true`, an email + password
    account gets no tokens from registration or login until it enters the code sent to its
    email (once). Google, Apple and wallet sign-in don't ask for it.
  - The older password change with an authenticator (TOTP) code still works for older app
    versions; the 2FA QR code is made in memory and never stored.
- Rate limits are set per endpoint (for example sign-in 30/min per IP, email codes 5/min,
  code checks 10/min, collect 30/min per user); see `REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]`
  in `backend/NextVibeAPI/NextVibeAPI/setting/prod.py`.

## What's public

- Posts become public only after moderation approves them. Public endpoints (share pages,
  link-preview cards, the public profile) return an explicit list of fields.
- Blocking hides two people from each other everywhere, and a tap between them is refused
  without showing the name. A tap only counts while the other person has Tap to Meet open.
- An event's attendee lists and tap graphs are for the event's owner only.
- Wallet addresses are public on-chain. Each Proof of Meet cNFT names both people's wallets
  as creators on purpose: that's the proof.
- Seeker Verified is granted only for a wallet the account has proven it controls: a wallet
  sign-in, or one signature of "Verify wallet for NextVibe" (a fresh message, used once).

## Proof of Meet selfies

- Uploads have their EXIF data removed and are re-encoded, checked by moderation, and kept in
  a private Cloudflare R2 bucket. The app reads them through signed URLs that expire after
  10 minutes.
- Nothing is shared until the other person approves, and either person can take the photo
  down at any time.

## Chats and encryption

Chats are end-to-end encrypted (format v3) between people whose apps have a device key.
The code is in `frontend/NextVibe/src/services/e2ee/` and `src/services/CryptoService.ts`;
[E2EE_MODERATION_POLICY.md](E2EE_MODERATION_POLICY.md) explains the design and how
moderation works with it.

- Every app install makes an X25519 key pair. The secret key stays in the phone's secure
  storage; the public key is published through the realtime service
  (`POST /api/v2/e2ee/devices`, at most 10 devices per account).
- Each message gets a fresh key. The text, and the keys of its photos and videos, are sealed
  with it (XSalsa20-Poly1305), and that key is sealed for every device of both people
  (NaCl `box`), the sender's other devices included. Photos and videos are sealed on the
  phone before upload, each with its own key.
- The server stores and relays ciphertext. It still sees who talks to whom and when,
  message sizes, reactions, read receipts and reply links.
- The chat's safety number (60 digits) is made from both people's device keys and is the
  same on both phones; comparing it in person shows that nobody sits in between. It changes
  when either person adds a device.
- Messages sent before this version (v2/v1 envelopes and plain text) stay readable. Those
  formats can be read by the server. While the other person's app has no device key yet,
  messages are sent in the older v2 format so they can read them; the chat header says
  "End-to-end encrypted" only when v3 is used.
- A device that loses its key (the app reinstalled on Android, a new phone) can't read
  v3 messages sealed before it had a key; they show as encrypted.
- Chat media files get random names. `manage.py rename_chat_media` gives files from before
  that change random names too (dry run unless `--apply`).
- Push notifications for encrypted messages don't include the message text.

## Moderation

- Public posts (text and media) and Proof of Meet selfies and captions are checked with OpenAI
  `omni-moderation-latest` by `moderation_service`. Its results reach the API only with the
  shared `MODERATION_CALLBACK_SECRET`. Rejected posts notify their author; posts can be
  reported from the app.
- Chats are not scanned.

## Services, keys and minting

- Configuration and keys come from environment variables. Each service has a `.env.example`
  with variable names and no values.
- The internal services listen on 127.0.0.1 by default and check a shared secret from the API:
  nft-service (`NFT_SERVICE_SECRET`), the moderation callback (`MODERATION_CALLBACK_SECRET`)
  and tx-indexer's write routes (`INDEXER_INTERNAL_SECRET`). tx-indexer's Swagger page is off
  in production.
- The Solana fee payer key exists only in nft-service's environment, and only the API and its
  workers call nft-service. `MINTS_DISABLED=true` pauses every mint.
- The public Solana RPC proxy refuses heavy cluster-wide methods and program-account scans
  outside the wallet program the app uses, and accepts batches of up to 20 calls.
- Backend-paid mints are bounded: one POAP per person per event, one Proof of Meet per pair
  per day (outside events) or per event, 10 collects (30 prepared) and 20 publishes per person
  per UTC day, per-user rate limits on every endpoint that can trigger a mint, a global daily
  cap on queued mints (`COLLECTIBLES_DAILY_MINT_CAP`), and a tree-capacity check before every
  batch.
