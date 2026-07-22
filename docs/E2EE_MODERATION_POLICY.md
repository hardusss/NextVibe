# NextVibe End-to-End Encryption (E2EE) & Moderation Policy Trade-off Architecture

## 1. Executive Summary & Policy Decision
With the rollout of End-to-End Encryption (Phase 3), message text and private media attachments are encrypted client-side using Double Ratchet / AES-256-GCM before transmission over the network and storage in the database.

As a direct consequence of zero-knowledge server-side storage:
- **Server-side Automated Moderation Scanners**: Cannot inspect message text or private media attachments for active E2EE chats, as the server holds only ciphertext blobs.
- **Public Content**: Public posts, public comments, vibe feeds, and user profiles remain unencrypted and continue to be scanned automatically by `moderation_service` (Go).
- **E2EE Chat Moderation**: Shifts from involuntary server-side text scanning to **user-initiated voluntary reporting** (matches standard Signal/WhatsApp moderation architecture).

---

## 2. Technical Architecture & Trust Boundaries

```
┌───────────────────────────────┐                  ┌───────────────────────────────┐
│     Sender Client (Device)    │                  │   Recipient Client (Device)   │
│ 1. AES-256-GCM Encrypt Text   │                  │ 1. Receive Ciphertext         │
│ 2. Encrypt Media prior to R2  │                  │ 2. Local Ratchet Decrypt      │
└───────────────┬───────────────┘                  └───────────────┬───────────────┘
                │ Ciphertext Payload                               │ Voluntary Report
                ▼                                                  ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             NextVibe Server / Gateway                            │
│  - Routes & stores ciphertext blobs (zero-knowledge)                              │
│  - Endpoint `POST /api/v2/chat/report-message` processes user-submitted reports   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### What the Server Stores
- `chat_message.text`: Encrypted JSON blob containing ciphertext, nonce, and sender device ratchet header.
- Metadata (Plaintext for routing & UX): `chat_id`, `sender_id`, `created_at`, `reply_to_id`, `message_receipts`, `message_reactions`.

### User-Initiated Voluntary Abuse Reporting
If a recipient receives abusive, illegal, or harassing content in an E2EE chat:
1. The user taps **"Report Message"** in the app.
2. The client packages the locally-decrypted message content, sender's identity public key, sender signature, and message metadata.
3. The report is submitted to `POST /api/v2/chat/report-message`.
4. `moderation_service` receives the voluntary report for review.

---

## 3. Product Sign-off Checklist
- [x] Product & Legal align on E2EE zero-knowledge trust model.
- [x] Server-side automated scanning disabled for E2EE chats.
- [x] User-initiated voluntary reporting UI enabled in mobile app.
- [x] Safety number comparison & identity verification UI live.
