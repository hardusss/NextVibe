# 🚀 NextVibe: The IRL-to-Web3 Social Graph

**Built for the Solana Mobile Hackathon 2026**

![NextVibe Banner](https://nextvibe.io/logo.png)

### 🔗 Important Links
* **🎥 Demo Video:** https://youtu.be/BZwYKiNW9kI?si=RCM8IiwMReNVF5wF
* **📊 Pitch Deck:** https://drive.google.com/file/d/1gOSasFNecBx6WxJhF90kDOcvYDxhwWtR/view?usp=drive_link
* **🎥📊 Video Pitch:** https://youtu.be/1EpUWRV9mZY
* **📱 Download APK:** https://media.nextvibe.io/NextVibe.apk
* **🔗 Site:** https://nextvibe.io

> 🚨 **Solana Mobile Judges Update (Post-Submission Grind):** We didn't stop building after March 10th. NextVibe is now in closed beta! 
> Download our latest release and use the exclusive judge code **`SEEKER`** to bypass the waitlist and claim your OG cNFT Avatar!

## 🔥 The Asymmetric Advantage: Making the Solana Seeker Superior

QR codes are dead. We built a custom **Cross-Platform APDU NFC Module** that transforms any Android device (like the Solana Seeker or Saga) into an active Web3 emitter. 

**Here is the killer hook:** Apple strictly locks down their NFC hardware. An iPhone cannot act as a host. But with NextVibe, a **Solana Seeker can actively push a profile, cNFT, or Solana Pay transaction directly to any iPhone or Android phone** with a single physical tap. The iPhone can receive it instantly without even having the app installed, but it cannot do the reverse. 

*We just made the Solana Mobile device the most powerful Web3 networking tool in the room.*

* 🍏 **Bypassing Apple Wallet:** Our custom APDU logic cleanly bypasses the aggressive Apple Wallet pop-ups on iOS. A tap triggers the native Phantom/Solflare wallet instantly via universal links.
* 🛡️ **Hardware-Level Proof of Presence:** You can't fake a physical tap. This ensures every interaction on NextVibe happens strictly In-Real-Life.

### 🎥 Live Demo: Cross-Platform NFC Transaction
*Watch how seamlessly a Solana phone pushes data to another device using our APDU module.*

https://github.com/user-attachments/assets/4c6867ce-055c-4259-b840-75a5ff21657e

## ❌ The Problem
Web3 social apps today are plagued by friction. For a mobile user, saving content or interacting with creators requires deep blockchain knowledge, seed phrases, and constant transaction signing. Furthermore, existing apps completely ignore the physical world (IRL) — your real-life connections don't translate into your digital social graph.

## ✅ The Solution
NextVibe is a mobile-first Web3 social network that makes blockchain invisible but keeps the true ownership. We turn digital content and IRL physical interactions into gasless collectibles on Solana, designed specifically for the next generation of crypto-phones like the Seeker.

## 🔥 Key Features
* **📱 IRL Connections (NFC Tap-to-Connect):** Blur the line between the physical and digital worlds. Share your Web3 profile and social graph simply by tapping your phones together.
* **🤝 Tap-to-Pay (NFC Token Transfers):** Go beyond profile sharing. Bring crypto into the physical world by sending SOL or SPL tokens to another user IRL with a single NFC tap.
* **⚡ Zero-Friction UX (Gasless Minting):** Users can collect posts as cNFTs in one click. Our ElysiaJS backend acts as the fee payer, completely abstracting away gas fees for the end-user.
* **💸 Smart Creator Monetization (95/5 Split):** Built-in on-chain revenue sharing. When a user collects a paid post, the transaction automatically splits the SOL: 95% directly to the creator's wallet, and 5% to the platform.
* **🔒 Mobile-First Onboarding:** Seamless integration with Solana Mobile Wallet Adapter (MWA). Tested and fully functional with Solflare.

## 📈 Traction & The IRL Pivot
NextVibe is live and actively validating our hypotheses. We currently have **115 active beta users**. 

*Note on our journey:* Before our recent pivot, we successfully scaled to over 300+ posts. However, to fully commit to our new "IRL-first" vision for the Solana Mobile ecosystem, we made the tough but necessary decision to pivot away from our initial AI-centric approach. We archived legacy content to focus strictly on authentic, physical-world interactions.

## 🛠️ What We Built During the Hackathon
We used this hackathon to completely overhaul NextVibe and maximize the capabilities of crypto-native mobile devices:

* **📸 Authentic Camera-Only Posts:** To ensure real-world authenticity, posts can now only be created using the in-app camera in real-time (limited to 1 photo per post). No camera roll uploads, no fake vibes.
* **💎 Gasless cNFT Minting & Monetization:** Creators can instantly mint their posts as cNFTs absolutely for free—without even signing a transaction. They set a price, and followers can collect these limited-edition drops (strictly capped at 50 editions per post) directly from the feed.
* **📳 NFC-Powered IRL Interactions:** We shipped "Tap-to-Pay" for seamless token transfers and "Tap-to-Connect" for instant profile sharing in the physical world.
* **🎨 Complete UI/UX Redesign:** A fresh, minimalist interface optimized for a zero-friction mobile Web3 experience.
* **🛡️ Advanced Content Moderation:** Deployed a brand-new, robust automated moderation engine to ensure a clean and safe community feed.

## 👥 Team
* **Danylo Klepar - Founder & Lead Developer:** Full-stack architecture, Solana integrations, and microservices backend.
* **Mark Vendysh - Co-Founder:** Business development, finance, and operations.

## 🛠 Tech Stack
* **Frontend:** React Native, Expo, Solana MWA, LazorKit
* **Backend & Microservices:** Django REST Framework, Go, FastAPI, ElysiaJS
* **Blockchain Layer:** Umi, Bubblegum
* **Database & Infrastructure:** MySQL, Redis, Cloudflare R2, Cloudinary


## 🚀 How to Run (Local Setup)

### 1. Prerequisites
Ensure you have the following installed and running:
* **Python 3.11**
* **Node.js & Bun**
* **Go**
* **MySQL & Redis** (running locally or via Docker)
* **Android Device / Emulator** (with Solflare installed)

### 2. Environment Variables
You will need to set up `.env` files for each microservice. *Note: Never commit your actual keys to the repository.*

**Data Layer (Django)** Location: `backend/NextVibeAPI/.env` & `backend/NextVibeAPI/setting/.env`
```env
ALLOWED_HOSTS=
CORS_ALLOWED_ORIGINS=
SECRET_KEY=
DJANGO_ENV=

# Database
DB_NAME=
DB_USER=
DB_PASSWORD=
DB_HOST=
DB_PORT=

# Cloudinary
CLOUD_NAME=
API_KEY=
API_SECRET=

# Cloudflare R2
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
BUCKET_NAME=
ENDPOINT_URL=
CUSTOM_DOMAIN=
```

**Frontend (React Native / Expo)** Location: `frontend/NextVibe/.env`
```env
EXPO_PUBLIC_NEXTVIBE_PUBKEY=
```

**AI Moderation Service (Go)** Location: `moderation_service/.env`
```env
PORT=
OPENAI_API_KEY=
```

**NFT Minting Service (ElysiaJS / Bun)** Location: `nft-service/.env`
```env
SOLANA_PRIVATE_KEY=
COLLECTION_ADDRESS=
MERKLE_TREE_ADDRESS=
HELIUS_RPC_URL=
```

**Socket Service (FastAPI)** Location: `socket_service/.env`
```env
# Database
DB_NAME=
DB_USER=
DB_PASSWORD=
DB_HOST=
DB_PORT=

# Cloudflare R2
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
BUCKET_NAME=
ENDPOINT_URL=
CUSTOM_DOMAIN=

# JWT Auth
JWT_SECRET_KEY=
JWT_ALGORITHM=

# Settings
ENVIRONMENT=
LOG_LEVEL=
CORS_ORIGINS_PROD=
```

### 3. Start the Services

**1. Data Layer & Background Tasks (Django + Celery)**
Ensure Redis is running before starting Celery.
```bash
# Setup Python environment and run Django
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
pip install -r modules.txt
cd NextVibeAPI
python manage.py migrate
python manage.py runserver

# In a new terminal (with venv activated), start Celery Worker:
celery -A NextVibeAPI worker -l info

# In another terminal, start Celery Beat:
celery -A NextVibeAPI beat -l info
```
**2. AI Moderation Service (Go)**
```bash
cd moderation_service
go build -o moderator_bin .
./moderator_bin
```

**3. NFT Minting Service (ElysiaJS)**
```bash
cd nft-service
bun install
bun run dev
```

**4. Socket Service (FastAPI)**
```bash
cd backend
source .venv/bin/activate
cd ..
cd socket_service
uvicorn main:app --reload
```

**5. Mobile App (Expo)**
```bash
cd frontend/NextVibe
npm install
npx expo start
```
*Press `a` to run on the Android emulator, or scan the QR code with Expo Go on a physical device.*

## ℹ️ Hackathon Info
* **Track:** Consumer / Social Web3
* **Network:** Solana Devnet

## 📞 Contact & Links
* **Website:** [nextvibe.io](https://nextvibe.io)
* **Project X (Twitter):** [@NextVibeWeb3](https://x.com/NextVibeWeb3)
* **Founder X (Twitter):** [@DanKlepar](https://x.com/DanKlepar)
* **Founder Telegram:** [@danylo_nv](https://t.me/danylo_nv)
* **Founder Email:** [dklepar29@gmail.com](mailto:dklepar29@gmail.com)

## 📄 License
**All Rights Reserved.**

This project and its source code are proprietary. You may view the code for educational and hackathon evaluation purposes. However, you are **strictly prohibited** from copying, modifying, distributing, selling, or using this project (or any of its parts) as a template for your own projects, whether for free or for commercial purposes, without explicit written permission from the author.
