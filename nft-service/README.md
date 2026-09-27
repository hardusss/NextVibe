# nft-service

Bun + Elysia + Umi service that mints NextVibe compressed NFTs (Metaplex Bubblegum) on Solana:
post editions, event POAPs, Proof of Meet and the OG badge. The backend keypair pays every
network fee and is the tree creator and collection authority, so minting is free for
people. It also checks wallets for a Seeker Genesis Token.

On-chain flows are described in [docs/SOLANA.md](../docs/SOLANA.md).

## How it fits in

- **Called by:** the Django API and its Celery workers (`NFT_SERVICE_URL`, default
  `http://localhost:3000`): the collectibles queue (`posts/src/collectible_mint.py`), collect
  and publish (`posts/view_pac/collect.py`, `mint_nft.py`), the OG badge
  (`user/views_pac/mint_og.py`), Seeker checks (`user/src/seeker_verification.py`) and backfill
  commands.
- **Calls:** Solana through `HELIUS_RPC_URL`, and the API for metadata JSON
  (`https://api.nextvibe.io/api/v1/posts/<post_id>/metadata/<edition>/`, used for the on-chain
  name). Proof of Meet names and URIs come from the API in the request.
- **Stores:** nothing. One in-process lock serializes mints so leaf numbers never collide.

## Run it

```bash
cd nft-service
bun install
cp .env.example .env     # fill it in
bun run dev              # http://localhost:3000, restarts on changes
```

In production it runs as the `nextvibe-nft` systemd unit, which the deploy workflow restarts
(the unit file isn't in this repository).

One-off setup scripts (each one sends a transaction and pays rent from the backend wallet):

```bash
bun run src/create-tree.ts             # Merkle tree: depth 14 (16,384 leaves), buffer 64, canopy 8
bun run src/create-collection.ts       # a collection NFT (its current settings create the OG collection)
bun run src/create-meet-collection.ts  # the Proof of Meet collection; refuses if MEET_COLLECTION_ADDRESS is set
```

## Environment variables

Listed in [.env.example](.env.example).

| Variable | Required | Purpose |
|---|---|---|
| `SOLANA_PRIVATE_KEY` | yes | Base58 secret key of the backend wallet: fee payer for every mint, tree creator and collection authority |
| `HELIUS_RPC_URL` | yes | Solana RPC URL with API key (Helius), used for sending transactions and Token-2022 scans |
| `MERKLE_TREE_ADDRESS` | yes | Bubblegum Merkle tree that stores every compressed NFT leaf (create it with `bun run src/create-tree.ts`) |
| `COLLECTION_ADDRESS` | yes | Collection for /mint and /collect/* (posts and event POAPs) |
| `OG_COLLECTION_ADDRESS` | for OG badges | Collection for /mint/og (the OG badge) |
| `MEET_COLLECTION_ADDRESS` | for Proof of Meet | Proof of Meet collection (create once with `bun run src/create-meet-collection.ts`); empty makes /mint/meet answer 503 |
| `MEET_METADATA_PREFIX` | no | URL prefix of Proof of Meet metadata JSON (default https://api.nextvibe.io/meta/meet/) |

## Files

| File | What |
|---|---|
| `src/index.ts` | The HTTP service: every endpoint below |
| `src/create-tree.ts` | Creates the Bubblegum Merkle tree |
| `src/create-collection.ts`, `src/create-meet-collection.ts` | Create collection NFTs |

## Tests

There is no test suite; the `test` script in `package.json` is a placeholder. The API's tests fake this service
(`posts/tests/test_collectibles.py`, `test_collect.py`, `test_meet_photos.py`).

## Endpoints

### GET /tree

How full the Merkle tree is. The Django collectibles queue
(`posts/src/collectible_mint.py`) reads it before each batch: it never
starts a batch the tree can't finish, and it alerts the admin at 80 %.

Returns: `{ success, tree, capacity, minted, remaining }`; `502 TREE_STATUS_FAILED`

### POST /mint

Fully backend-signed mint of a post edition to a recipient. Used for the
owner's publish path, for collectors whose wallet cannot co-sign
(LazorKit / passkey sessions), and for event POAPs (the collectibles queue).
The on-chain name comes from the metadata JSON and is cut to 32 bytes. A
mint that fails on-chain answers 502 (a skipped preflight still confirms a
failed transaction), so the caller retries instead of recording a leaf
that isn't there; `/mint/og` does the same.

Body: `{ recipient, postId, edition }`
Returns: `{ success, signature, assetId }`; `502 METADATA_FETCH_FAILED`, `502 MINT_SEND_FAILED`

### POST /mint/og

Backend-signed mint of an OG badge cNFT (max edition 25).

Body: `{ recipient, userId, edition }`
Returns: `{ success, signature, assetId }`

### POST /mint/meet

Backend-signed, gasless mint of one Proof of Meet cNFT: one leaf for each of
the two people who met and took the selfie. Goes into the Proof of Meet
collection with symbol `NVMEET` and no royalties. Creators: the NextVibe
authority (verified, 100 %), then both people's wallets (`coAuthors`,
unverified, 0 %), so every leaf names the two wallets on-chain as proof of
the meet. `coAuthors` must include the recipient; it holds one wallet only
while the other person hasn't connected one (their own leaf lists both).
Nothing is fetched here: the Django backend passes the name (at most 32
bytes) and the metadata URI: `MEET_METADATA_PREFIX<slug>/<user id>.json`
(each person's own copy, for every Proof of Meet recorded at a tap) or
`MEET_METADATA_PREFIX<slug>.json` (leaves minted for a v2 selfie before that).

Body: `{ recipient, slug, name, uri, coAuthors }`
Returns: `{ success, signature, assetId }`; `400 INVALID_REQUEST`,
`503 MEET_COLLECTION_NOT_CONFIGURED`, `502 MINT_SEND_FAILED`

### POST /collect/prepare

Phase 1 of the user-signed free collect. Builds a transaction containing
`mintToCollectionV1` plus an SPL Memo instruction that lists the user's
wallet as a required signer (the Memo program rejects the transaction
unless every listed account signed — that's what makes the claim
user-signed while the backend stays fee payer). The blockhash is fetched
last so the client gets the full ~60–90s lifetime, and the backend
partially signs before returning.

Body: `{ recipient, postId, edition, memo, userPubkey }`
Returns: `{ success, transaction (base64), messageHash (sha256 hex of the
message), blockhash, expiresAt }`

Nothing is stored in-process — the Django backend holds pending-claim
state, so restarts are safe.

### POST /collect/submit

Phase 2. Verifies the returned transaction's message hash matches the one
issued by prepare (`400 TX_TAMPERED` otherwise) and that every required
signer carries a valid signature (`400 USER_SIGNATURE_MISSING`), then
broadcasts, confirms at `confirmed`, and parses the leaf asset ID with the
same retry loop as `/mint`. An expired blockhash returns `410
CLAIM_EXPIRED` — the client should re-run prepare.

Body: `{ signedTransaction (base64), messageHash, postId?, edition? }`
(postId/edition are for logging only)
Returns: `{ success, signature, assetId }`

Logging: successful collects log `postId`, `edition`, and the signature.
The serialized transaction is never logged.

### POST /asset-id-from-signature

Reads the asset id and leaf index from a confirmed mint transaction. Used by the API's
backfill command for old records.

Body: `{ signature }` (base58 or base64)
Returns: `{ success, assetId, nonce }`; `400 MISSING_SIGNATURE`, `404 ASSET_ID_NOT_FOUND`

### POST /seeker/sgt-check

Whether a wallet holds a Seeker Genesis Token: lists the wallet's Token-2022 accounts through
the Helius RPC and checks each mint's authority and group against Solana Mobile's values.

Body: `{ wallet }`
Returns: `{ success, sgtMint }` (`null` when there is none); `400 INVALID_WALLET`,
`502 SGT_CHECK_FAILED`
