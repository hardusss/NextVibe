# CLOCK IN Hackathon Changelog (Sep 8 – Oct 8, 2026)

All work below was built during the hackathon window. Format: date · scope · summary · key files.

## 2026-09-09
- chore(repo): add hackathon changelog to track all CLOCK IN work. Files: `CHANGELOG-hackathon.md`
- feat(nft-service): two-phase user-signed free collect — `POST /collect/prepare` builds a gasless mint tx (backend fee payer) with an SPL Memo instruction requiring the collector's signature and partial-signs it; `POST /collect/submit` verifies the message hash and all required signatures, broadcasts, confirms, and parses the cNFT asset ID. Files: `nft-service/src/index.ts`
