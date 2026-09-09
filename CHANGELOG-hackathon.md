# CLOCK IN Hackathon Changelog (Sep 8 – Oct 8, 2026)

All work below was built during the hackathon window. Format: date · scope · summary · key files.

## 2026-09-09
- chore(repo): add hackathon changelog to track all CLOCK IN work. Files: `CHANGELOG-hackathon.md`
- feat(nft-service): two-phase user-signed free collect — `POST /collect/prepare` builds a gasless mint tx (backend fee payer) with an SPL Memo instruction requiring the collector's signature and partial-signs it; `POST /collect/submit` verifies the message hash and all required signatures, broadcasts, confirms, and parses the cNFT asset ID. Files: `nft-service/src/index.ts`
- feat(backend): free collect endpoints — `PendingClaim` model reserves editions for in-flight claims; `POST /posts/collect/prepare/` enforces wallet/ownership/duplicate checks, a 10-claims-per-UTC-day limit, 50-edition supply cap, and a 24h IRL reservation of editions 2–11 (networking tap or event check-in with the author); `POST /posts/collect/submit/` finalizes the user-signed mint, awards +2 rep to IRL-connected claimers, and pushes the author. Owner publish path (`cnft-mint/`) stripped of price/payment handling; post serializers now expose a `collect` object and no longer serialize prices. Files: `backend/NextVibeAPI/posts/{models,constants,urls}.py`, `posts/src/collect_{eligibility,memo}.py`, `posts/view_pac/{collect,mint_nft,get_post,recommendation_feed}.py`, `posts/serializers_pac/recommendation_feed_serializer.py`
