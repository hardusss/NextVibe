# End-to-end encryption and moderation

> **Status (Sep 27, 2026):** chats are end-to-end encrypted (format v3) between people whose
> apps have a device key. [SECURITY.md](SECURITY.md#chats-and-encryption) lists what the
> server can and can't see.

## 1. Policy

- **Chats:** message text and chat photos and videos are encrypted on the phone. The server
  stores and relays ciphertext, so it can't scan chats.
- **Public content** (posts, comments, profiles, Proof of Meet selfies and captions) is not
  encrypted and is still checked by `moderation_service` before anyone else sees it.
- **Chat moderation** relies on the person who received a message reporting it: their app
  can read it, so they can send it in (the model Signal and WhatsApp use).

## 2. How v3 works

```
┌──────────────────────────────┐                     ┌──────────────────────────────┐
│ Sender's phone               │                     │ Every phone of both people   │
│ 1. new message key           │                     │ 1. open its copy of the key  │
│ 2. seal text + media keys    │    ciphertext       │    (NaCl box, own secret)    │
│ 3. seal each photo/video     │ ──────────────────▶ │ 2. open text + media keys    │
│ 4. box the message key for   │                     │ 3. download and open photos  │
│    each device of both       │                     │    and videos                │
└──────────────────────────────┘                     └──────────────────────────────┘
                 │                                                   ▲
                 ▼                                                   │
┌──────────────────────────────────────────────────────────────────────────────────┐
│ NextVibe realtime service: stores and relays ciphertext; publishes device        │
│ public keys (POST/GET /api/v2/e2ee/devices); media bucket holds sealed files only │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **Device keys:** each app install makes an X25519 key pair; the secret key stays in the
  phone's secure storage, the public key is published (at most 10 devices per account).
- **Messages:** a fresh 32-byte key per message; the payload (`{"t": text, "m": [media keys]}`)
  is sealed with XSalsa20-Poly1305 (NaCl `secretbox`), and the message key is sealed for every
  device of both people with NaCl `box` (sender device key + recipient device key).
- **Media:** each photo or video is sealed with its own key before upload; the key travels
  inside the sealed message. The app opens the file into its cache to show it.
- **Stored envelope** (`chat_message.text`):
  `{"v": 3, "sender_device_id", "sender_key", "nonce", "ciphertext", "keys": {device: {"n", "k"}}}`.
- **Safety number:** 60 digits made from both people's device keys; the same on both phones.
  Comparing it in person (or scanning each other's QR code) shows nobody sits in between.
- **Older messages:** v2/v1 envelopes and plain text still open on every device. While the
  other person's app has no device key, messages go in the v2 format so they can read them.
- **Plaintext metadata the server keeps:** chat and sender ids, times, reply links, reactions,
  read receipts and message sizes.

Code: `frontend/NextVibe/src/services/e2ee/{core,keys,media}.ts`,
`src/services/CryptoService.ts`, `socket_service/src/e2ee.py`,
`backend/NextVibeAPI/e2ee/models.py`.

## 3. Trade-offs

- A phone that loses its key (the app reinstalled on Android, a new phone) can't read v3
  messages sealed before it had a key. There's no key backup.
- The server publishes the device keys, so a server that lied about them could read new
  messages; the safety number is how people check. The app doesn't warn when the number
  changes.
- Reporting sends the reported message's decrypted text to NextVibe, so the reporter decides
  what leaves the chat.

## 4. Reporting

- `POST /api/v2/chat/report-message` (`socket_service/src/keys.py`) accepts a report from a
  chat participant with the decrypted text and a reason, and answers `reported`.
- TODO(founder): the endpoint doesn't store reports or pass them to `moderation_service` yet,
  and the app has no "Report message" button in chats. Decide where reports go (a table the
  admin console reads, or an email) before relying on it.

## 5. Checklist

- [x] Server can't read v3 chat text or media.
- [x] Public content is still moderated automatically.
- [x] Safety number shown in the chat (shield icon).
- [ ] Report button in chats and a place where reports are kept (see section 4).
