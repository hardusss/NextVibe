<p align="center">
  <img src="https://nextvibe.io/logo.png" alt="NextVibe" width="120" />
</p>

<h1 align="center">NextVibe</h1>

<p align="center">
  <strong>The IRL Networking Layer on Solana</strong>
</p>

<p align="center">
  <a href="https://nextvibe.io">Website</a> •
  <a href="https://media.nextvibe.io/NextVibe.apk">Download APK</a> •
  <a href="https://x.com/NextVibeWeb3">Twitter</a>
</p>

---

NextVibe is a mobile-first IRL Networking Layer built on Solana. It turns physical-world interactions — NFC taps, event check-ins, and real-life meetups — into an on-chain social graph backed by compressed NFTs, reputation scores, and verifiable proof of presence.

> **Closed Beta is Live.** Download the latest build and use the invite code **`SEEKER`** to bypass the waitlist and claim your OG cNFT Avatar.

## Why NextVibe Exists

Existing Web3 social tools fail at the physical layer. LinkedIn is Web2. POAPs are passive. QR codes are dead. There is no standard for proving "I met this person IRL" and translating that into on-chain reputation.

NextVibe solves this by making the **smartphone the networking primitive** — specifically crypto-native phones like the Solana Seeker that have NFC hardware access unrestricted by iOS limitations.

## Core Primitives

### 📳 NFC Tap-to-Connect
A custom **Cross-Platform APDU NFC Module** transforms any Android device into an active Web3 emitter. One physical tap shares your profile, triggers a Solana Pay transaction, or initiates an event check-in. Apple locks down HCE — a Solana Seeker can push data to any iPhone, but not the reverse. This makes the Seeker the most powerful Web3 networking device in the room.

### 🗺️ VibeMap
A Mapbox-powered interactive map (with globe/3D terrain modes) that plots every post, cNFT drop, and live event geospatially. Filter by posts or events, see clustering at low zoom, and discover what's happening around you in real-time.

### 🎫 Events & Check-ins
Create events via Luma integration, manage attendee requests with approve/reject flows, and run NFC-based check-ins at the door. Check-ins feed directly into the reputation system and generate on-chain proof of attendance.

### 💎 Gasless cNFT Minting
Every post can be minted as a compressed NFT — limited to 50 editions — without the creator signing a single transaction. The backend acts as the fee payer. Collectors pay in SOL with an automatic 95/5 creator/platform revenue split.

### ⭐ On-Chain Reputation
Every NFC tap, event check-in, and interaction generates reputation points tracked with H3 geo-indexing. Your reputation score is a verifiable proof of your IRL networking activity, tied to specific locations and events.

### 💳 Embedded Wallet
Full in-app wallet experience: token dashboard, send/receive, swap, NFC deposits, and complete transaction history — all powered by a real-time Helius-backed transaction indexer.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MOBILE APP                               │
│        React Native · Expo · Solana MWA · LazorKit              │
│    NFC Module · Mapbox · Vision Camera · Zustand                │
└────────────────────────┬────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌─────────────┐ ┌──────────┐ ┌────────────────┐
   │  Django API  │ │  Socket  │ │  Moderation    │
   │  (REST)      │ │  Service │ │  Service       │
   │  Celery +    │ │ FastAPI  │ │  Go + OpenAI   │
   │  Redis       │ │ WebSocket│ │                │
   └──────┬──────┘ └────┬─────┘ └────────────────┘
          │              │
          ▼              ▼
   ┌─────────────────────────────┐
   │         MySQL + Redis       │
   └──────────┬──────────────────┘
              │
     ┌────────┴────────┐
     ▼                 ▼
┌──────────┐    ┌─────────────┐
│ NFT      │    │ TX Indexer  │
│ Service  │    │ Bun+Elysia  │
│ Bun+Umi  │    │ Helius+     │
│ Bubblegum│    │ BullMQ      │
└──────────┘    └─────────────┘
              │
              ▼
     ┌────────────────┐
     │  Solana        │
     │  (Devnet)      │
     │  Merkle Trees  │
     │  cNFTs         │
     └────────────────┘
```

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Mobile** | React Native 0.79, Expo 53, TypeScript, Zustand, Reanimated |
| **Solana Integration** | MWA, LazorKit, @solana/web3.js, SPL Token |
| **NFC** | Custom APDU module (Expo Native Module), react-native-nfc-manager |
| **Maps** | Mapbox GL (globe + 3D terrain), H3 geo-indexing |
| **API** | Django 4.2, Django REST Framework, Celery, Redis |
| **Real-time** | FastAPI WebSockets |
| **NFT Minting** | ElysiaJS (Bun), Metaplex Umi, Bubblegum (cNFTs) |
| **TX Indexer** | ElysiaJS (Bun), BullMQ, Helius Enhanced API + Webhooks |
| **Content Moderation** | Go HTTP service, OpenAI Moderation API |
| **Storage** | MySQL, Cloudflare R2, Cloudinary |
| **Auth** | JWT, Google OAuth, Apple Sign-In, Wallet Sign-In (ed25519), 2FA (TOTP) |

## Microservices

| Service | Path | Runtime | Port | Purpose |
|---------|------|---------|------|---------|
| **Data API** | `backend/` | Python (Django) | 8000 | REST API, auth, posts, events, reputation, user management |
| **Socket Service** | `socket_service/` | Python (FastAPI) | 8001 | Real-time chat, presence, notifications via WebSocket |
| **NFT Service** | `nft-service/` | Bun (ElysiaJS) | 3000 | Gasless cNFT minting via Metaplex Bubblegum |
| **TX Indexer** | `tx-indexer/` | Bun (ElysiaJS) | 3001 | Wallet transaction indexing via Helius webhooks + BullMQ |
| **Moderation** | `moderation_service/` | Go | 8080 | AI-powered text + image content moderation |
| **Mobile App** | `frontend/NextVibe/` | React Native (Expo) | — | The user-facing application |

## Local Development

### Prerequisites

- Python 3.11+, Node.js 18+, Bun 1.1+, Go 1.21+
- MySQL 8.0+, Redis 7+
- Android device with Solflare installed (or emulator)

### Environment Setup

Each service requires its own `.env` file. See the table below for locations:

| Service | `.env` Location |
|---------|----------------|
| Django API | `backend/NextVibeAPI/.env` and `backend/NextVibeAPI/setting/.env` |
| Frontend | `frontend/NextVibe/.env` |
| Moderation | `moderation_service/.env` |
| NFT Service | `nft-service/.env` |
| Socket Service | `socket_service/.env` |
| TX Indexer | `tx-indexer/.env` (see `tx-indexer/.env.example`) |

### Start Services

```bash
# 1. Django API + Celery
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r modules.txt
cd NextVibeAPI && python manage.py migrate && python manage.py runserver
# (new terminal) celery -A NextVibeAPI worker -l info
# (new terminal) celery -A NextVibeAPI beat -l info

# 2. Moderation Service
cd moderation_service && go build -o moderator_bin . && ./moderator_bin

# 3. NFT Service
cd nft-service && bun install && bun run dev

# 4. TX Indexer
cd tx-indexer && bun install && bun run dev

# 5. Socket Service
cd socket_service && uvicorn main:app --reload

# 6. Mobile App
cd frontend/NextVibe && npm install && npx expo start
# Press 'a' for Android emulator or scan QR with Expo Go
```

## Key Features Summary

| Feature | Description |
|---------|-------------|
| **NFC Tap-to-Connect** | Share profiles & social graph with a physical phone tap |
| **NFC Tap-to-Pay** | Send SOL/SPL tokens IRL with one tap |
| **NFC Event Check-in** | Verify event attendance via NFC at the door |
| **VibeMap** | Globe/3D map view of all posts, NFTs, and live events |
| **Camera-Only Posts** | Real-time camera capture only — no gallery uploads, no fakes |
| **Gasless cNFT Minting** | Zero-cost minting for creators, 50-edition limited drops |
| **Creator Monetization** | Automatic 95/5 SOL split on paid collections |
| **Reputation System** | On-chain rep from taps, check-ins, and interactions (H3 geo-indexed) |
| **Luma Events** | Create, manage, and promote IRL events with attendee management |
| **Embedded Wallet** | Dashboard, send, swap, deposit, full tx history |
| **Real-time Chat** | WebSocket-powered messaging with media support |
| **AI Moderation** | Automated content screening via OpenAI (text + image) |
| **OG Avatars** | Limited-edition cNFT avatars for early adopters (25 max) |
| **Multi-Auth** | Email, Google, Apple, Wallet (ed25519 signature), 2FA |
| **Push Notifications** | Expo push notifications for likes, comments, follows, events |

## Links

| | |
|---|---|
| 🌐 **Website** | [nextvibe.io](https://nextvibe.io) |
| 📱 **Download** | [APK](https://media.nextvibe.io/NextVibe.apk) |
| 🎥 **Demo** | [YouTube](https://youtu.be/BZwYKiNW9kI?si=RCM8IiwMReNVF5wF) |
| 📊 **Pitch Deck** | [Google Drive](https://drive.google.com/file/d/1gOSasFNecBx6WxJhF90kDOcvYDxhwWtR/view?usp=drive_link) |
| 🎥 **Video Pitch** | [YouTube](https://youtu.be/1EpUWRV9mZY) |
| 𝕏 **Project** | [@NextVibeWeb3](https://x.com/NextVibeWeb3) |
| 𝕏 **Founder** | [@DanKlepar](https://x.com/DanKlepar) |
| ✉️ **Email** | [dklepar29@gmail.com](mailto:dklepar29@gmail.com) |
| 💬 **Telegram** | [@danylo_nv](https://t.me/danylo_nv) |

## Team

- **Danylo Klepar** — Founder & Lead Developer. Full-stack architecture, Solana integrations, microservices backend.
- **Mark Vendysh** — Co-Founder. Business development, finance, operations.

## License

**All Rights Reserved.**

This project and its source code are proprietary. You may view the code for educational and evaluation purposes. You are **strictly prohibited** from copying, modifying, distributing, selling, or using this project (or any of its parts) as a template for your own projects without explicit written permission from the author.
