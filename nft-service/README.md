# nft-service

Bun + Elysia + Umi microservice that mints NextVibe compressed NFTs
(Bubblegum) on Solana. The backend keypair pays every network fee and acts
as the collection authority, so minting is gasless for users.

## Development

```bash
bun install
bun run dev
```

Runs on http://localhost:3000. Required env vars: `SOLANA_PRIVATE_KEY`
(base58), `HELIUS_RPC_URL`, `COLLECTION_ADDRESS`, `OG_COLLECTION_ADDRESS`,
`MERKLE_TREE_ADDRESS`. Proof of Meet also needs `MEET_COLLECTION_ADDRESS`
(create the collection once with `bun run src/create-meet-collection.ts`);
until it's set, `/mint/meet` answers 503 and the backend keeps retrying.
`MEET_METADATA_PREFIX` defaults to `https://api.nextvibe.io/meta/meet/`.

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
