# Solana in NextVibe

Everything NextVibe puts on-chain is a compressed NFT (Metaplex Bubblegum). NextVibe pays
every network fee: people never need SOL to get a POAP, a Proof of Meet or a collected post.
This page walks through each flow, who signs, who pays, and where the code is.

- **Network:** mainnet. The app, the API's RPC proxy and DAS lookups use mainnet endpoints;
  nft-service uses whatever `HELIUS_RPC_URL` is set to.
- **Fee payer:** one backend keypair (`SOLANA_PRIVATE_KEY`, nft-service only). It pays every
  fee, owns the Merkle tree and is the authority of every collection.
- **RPC:** Helius. nft-service sends transactions through `HELIUS_RPC_URL`; the app reads
  the chain through the API's JSON-RPC proxy (`POST /api/v1/wallets/rpc/`), so no RPC key
  ships in the app.

## On-chain objects

| Object | Env var (nft-service) | Details |
|---|---|---|
| Merkle tree | `MERKLE_TREE_ADDRESS` | One Bubblegum tree for everything: max depth 14 (16,384 leaves), buffer 64, canopy 8. Created with `bun run src/create-tree.ts`; not public, so only the backend authority can mint into it. |
| NextVibe Collection | `COLLECTION_ADDRESS` | Event POAPs and collected posts. Symbol `NVIBE`. Collection JSON: `GET /api/v1/posts/collection/metadata/`. |
| NextVibe Proof of Meet | `MEET_COLLECTION_ADDRESS` | Proof of Meet cNFTs. Symbol `NVMEET`, 0 % royalties. Created with `bun run src/create-meet-collection.ts`; JSON: `…/collection/metadata/?kind=meet`. |
| NextVibe OG Status | `OG_COLLECTION_ADDRESS` | OG badge, at most 25 editions. JSON: `…/collection/metadata/?isOg=true`. |

Every mint uses Bubblegum `mintToCollectionV1` (`nft-service/src/index.ts`). The asset id is
derived from the tree's leaf count before sending, under an in-process lock, so two mints
never race for the same leaf. Transactions are sent with `skipPreflight`, confirmed at
`confirmed`, and a transaction that failed on-chain is reported as a failure.

Metadata JSON is served by the API, not stored on-chain:

| Leaf | Metadata URI |
|---|---|
| Post edition or event POAP | `https://api.nextvibe.io/api/v1/posts/<post_id>/metadata/<edition>/` |
| Proof of Meet (one per person) | `https://api.nextvibe.io/meta/meet/<slug>/<user_id>.json` |
| OG badge | `https://api.nextvibe.io/api/v1/posts/0/metadata/<edition>?isOg=true&userId=<id>` |

## Collect a post (free, user co-signed)

Posts have 50 editions by default. Edition 1 is the author's own ("publish"); the rest can be
collected, 10 per person per UTC day. For the first 24 hours, editions 2–11 are reserved for
people who met the author in person (Tap to Meet).

On Android with a Mobile Wallet Adapter wallet (Seed Vault on Seeker, or any MWA wallet):

1. The app calls `POST /api/v1/posts/collect/prepare/` (`backend/NextVibeAPI/posts/view_pac/collect.py`).
   The API checks the limits and reserves the edition under a row lock (`PendingClaim`).
2. The API asks nft-service `POST /collect/prepare`. It builds one transaction with
   `mintToCollectionV1` plus an SPL Memo instruction that lists the collector's wallet as a
   required signer. The memo reads `NextVibe | collected post <id> | #<n> of <total>`
   (plus `| event: <slug>` for event posts; `posts/src/collect_memo.py`). The backend signs
   as fee payer and returns the transaction.
3. The app asks the wallet to sign it with MWA `signTransactions` (no send).
4. The app calls `POST /api/v1/posts/collect/submit/`. nft-service checks that the message is
   the one it issued and that every required signer signed, sends it and confirms it. The
   API records the collect (`UserCollection`, and the collectible in the profile).

So the collector's signature is required on-chain (the memo), while NextVibe pays the fee.

On iOS and with passkey wallets (LazorKit), where MWA doesn't exist, the app sends
`signer: "none"` and the API asks nft-service `POST /mint` for a backend-signed mint to the
collector's saved wallet.

## Publish your own post

`POST /api/v1/posts/cnft-mint/` (`posts/view_pac/mint_nft.py`) mints edition 1 of an approved
post to its author's wallet through nft-service `POST /mint`. Organizers publish event posts
the same way.

## POAP at an event check-in

1. Check-in (`posts/view_pac/event_checkin.py`, or a check-in tap through
   `proximity/verify-token/`) records a `Collectible` of kind `poap` for the attendee: one
   edition of the event post, up to the event's supply (default 50). See [EVENTS.md](EVENTS.md).
2. With a wallet linked, the row is queued and the Celery worker mints it through nft-service
   `POST /mint` into the NextVibe Collection. The app shows "Minting POAP…", then
   "POAP minted · +N REP".
3. Without a wallet, the POAP stays on the profile off-chain and the app shows
   "POAP saved · claim anytime" (see [Claim later](#claim-later)).

## Proof of Meet

1. A confirmed Tap to Meet (see [TAP_TO_MEET.md](TAP_TO_MEET.md)) records one `Collectible`
   of kind `meet` for each of the two people, both tied to the meet's slug.
2. The worker mints each person's leaf through nft-service `POST /mint/meet` into the
   Proof of Meet collection. Every leaf lists as creators the NextVibe authority (verified,
   100 %) and both people's wallets (unverified, 0 %), so the pair is named on-chain.
   If one person has no wallet yet, their leaf is minted later and the other leaf lists one
   address.
3. The optional selfie doesn't mint anything new. Once both people approve it, the metadata
   of their two leaves shows the photo (`posts/src/meet_photos.py`).

## Claim later

POAPs and Proof of Meet don't need a wallet. Each is a `Collectible` row
(`posts/src/collectibles.py`) with a status: `offchain` → `queued` → `minting` → `minted`
(or `failed`).

- Linking a wallet (`POST /api/v1/users/save-wallet/`) queues everything that was off-chain.
- **Claim** (`POST /api/v1/collectibles/<id>/claim`) and **Claim all**
  (`POST /api/v1/collectibles/claim-all`) queue one row or all of them.
- The Celery worker (`posts/src/collectible_mint.py`) takes rows with a compare-and-set
  update, so a row is never minted twice, and calls nft-service one mint at a time.
  Failures retry after 30 s, 2 min, 10 min and 30 min, then stop until the next Claim.
  Before a retry it asks Helius DAS (`searchAssets`) whether the leaf already landed.
- Limits: a global daily cap (`COLLECTIBLES_DAILY_MINT_CAP`, default 5,000), at most
  `COLLECTIBLES_USER_BATCH_CAP` (200) rows per person per run, and no batch starts unless the
  tree has room (the admin gets a push at 80 % full).

## Seeker Verified

The Seeker Genesis Token (SGT) is a Token-2022 NFT in every Solana Seeker phone.

1. nft-service `POST /seeker/sgt-check` lists the wallet's Token-2022 accounts through the
   Helius RPC and looks for a mint whose mint authority is
   `GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4` and whose group is
   `GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te` (Solana Mobile's published values).
2. The API (`user/src/seeker_verification.py`) runs the check when someone signs in with a
   wallet, links a wallet, or taps Verify; results are cached for 24 hours, and one Genesis
   Token can verify one account.
3. The profile shows the Seeker Verified badge, with a share card at
   `nextvibe.io/u/verified/<username>`.

An operator command (`grant_seeker_badges`) can also grant the badge to accounts named with
a Seeker ID (`.skr`); those show "Seeker ID (.skr) confirmed" instead of
"Genesis Token confirmed on-chain".

## Wallets and user signatures

| Wallet | Platform | Used for |
|---|---|---|
| Mobile Wallet Adapter (Seed Vault on Seeker, other MWA wallets) | Android | Sign-in (signed message), collect co-signature, transfers, Jupiter swaps |
| LazorKit passkey wallet | Android, iOS | Sign-in, transfers; fees can be sponsored by a paymaster |
| Phantom, Solflare, Backpack (deep links) | iOS | Connect a wallet address |

NextVibe signs: every cNFT mint (as fee payer and authority). The user signs: the sign-in
message, the collect co-signature, transfers (tap-to-pay) and swaps.

**Tap-to-pay:** the receiver broadcasts a payment request over NFC or Bluetooth (on Android
as a Solana Pay URI); the payer sees it prefilled and signs a SOL or SPL transfer with their
wallet. **Swaps:** Jupiter Swap API, Android only (`src/services/JupiterService.ts`).

## Transaction history (Helius indexer)

The tx-indexer keeps a Helius enhanced webhook in sync with users' wallets, stores their
transactions in MySQL, and tells the API when a new one arrives so the owner gets a push.
The app reads history from the API (`/api/v1/wallets/transactions/`). See
[tx-indexer/README.md](../tx-indexer/README.md).

## Where to look

| Topic | Code |
|---|---|
| Minting service | `nft-service/src/index.ts`, `create-tree.ts`, `create-collection.ts`, `create-meet-collection.ts` |
| Collect | `backend/NextVibeAPI/posts/view_pac/collect.py`, `posts/src/collect_memo.py`, app `components/NftClaim/` |
| Collectibles queue | `backend/NextVibeAPI/posts/src/collectibles.py`, `collectible_mint.py`, `das.py`, `collectible_metadata.py` |
| Seeker Verified | `nft-service/src/index.ts` (`/seeker/sgt-check`), `backend/NextVibeAPI/user/src/seeker_verification.py` |
| Wallets in the app | `frontend/NextVibe/app/_layout.tsx`, `src/services/walletDeepLink.ts`, `components/SignInViaWallet/` |
