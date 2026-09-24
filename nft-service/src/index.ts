import { Elysia } from "elysia";
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import {
    mplBubblegum,
    mintToCollectionV1,
    parseLeafFromMintToCollectionV1Transaction,
    fetchTreeConfigFromSeeds,
    findLeafAssetIdPda,
} from '@metaplex-foundation/mpl-bubblegum'
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { publicKey, isPublicKey, keypairIdentity, createNoopSigner, PublicKey } from '@metaplex-foundation/umi'
import { createHash } from 'node:crypto'
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters'
import { Keypair, Connection, PublicKey as Web3PublicKey } from '@solana/web3.js'
import {
    TOKEN_2022_PROGRAM_ID,
    unpackMint,
    getMetadataPointerState,
    getTokenGroupMemberState,
} from '@solana/spl-token'
import bs58 from 'bs58'
import { config } from 'dotenv'

config()

/**
 * Backend fee payer keypair loaded from a base58-encoded private key.
 * This wallet pays for all minting transactions and acts as the collection authority.
 */
const keypair = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY!))

/**
 * Umi instance connected to the Helius RPC.
 */
const umi = createUmi(process.env.HELIUS_RPC_URL!, 'confirmed')
    .use(mplBubblegum())
    .use(mplTokenMetadata())
    .use(keypairIdentity(fromWeb3JsKeypair(keypair)))

/**
 * Umi wrapper with explicit 'confirmed' commitment for one-shot transaction log parsing.
 */
const umiConfirmed = {
    ...umi,
    rpc: {
        ...umi.rpc,
        getTransaction: (sig: Uint8Array, o?: any) =>
            umi.rpc.getTransaction(sig, { ...o, commitment: 'confirmed' }),
    },
} as typeof umi

/** Verified collection NFT address */
const COLLECTION_ADDRESS = process.env.COLLECTION_ADDRESS!;
const OG_COLLECTION_ADDRESS = process.env.OG_COLLECTION_ADDRESS!;
/**
 * Proof of Meet collection (create it once: `bun run src/create-meet-collection.ts`).
 * Unset, /mint/meet answers 503 and the Django side keeps retrying.
 */
const MEET_COLLECTION_ADDRESS = process.env.MEET_COLLECTION_ADDRESS ?? '';
/** Every Proof of Meet leaf points at its meet's JSON on the API */
const MEET_METADATA_PREFIX = process.env.MEET_METADATA_PREFIX ?? 'https://api.nextvibe.io/meta/meet/';
const MEET_SLUG_RE = /^[0-9A-Za-z]{12}$/;
/** A leaf recorded at a tap points at its holder's copy: `${MEET_METADATA_PREFIX}<slug>/<user id>.json` */
const MEET_HOLDER_PATH_RE = /^[0-9A-Za-z]{12}\/[1-9][0-9]{0,11}\.json$/;
/** A meet has two people; both are creators of every one of its leaves */
const MAX_MEET_CO_AUTHORS = 2;
/** Bubblegum's on-chain limits (bytes) */
const MAX_NAME_BYTES = 32;
const MAX_URI_BYTES = 200;
/** Merkle tree address for storing compressed NFT leaves */
const MERKLE_TREE_ADDRESS = process.env.MERKLE_TREE_ADDRESS!;

/** SPL Memo program */
const MEMO_PROGRAM_ID = publicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/** Seeker Genesis Token verification constants (Solana Mobile docs) */
const SGT_MINT_AUTHORITY = new Web3PublicKey('GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4');
const SGT_GROUP_ADDRESS = new Web3PublicKey('GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te');

/** web3.js connection for Token-2022 account scans (shares the Helius RPC URL with Umi) */
const web3Connection = new Connection(process.env.HELIUS_RPC_URL!, 'confirmed');

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Scans a wallet's Token-2022 accounts for a Seeker Genesis Token.
 * Returns the SGT mint address, or null if the wallet holds none.
 *
 * Follows the official verification algorithm: paginate
 * getTokenAccountsByOwnerV2, skip zero balances, then confirm mint
 * authority, metadata pointer and token-group membership on each mint.
 */
async function findSgtMint(wallet: string): Promise<string | null> {
    const heldMints: Web3PublicKey[] = [];
    let paginationKey: string | null = null;

    do {
        const response = await fetch(process.env.HELIUS_RPC_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwnerV2',
                params: [
                    wallet,
                    { programId: TOKEN_2022_PROGRAM_ID.toBase58() },
                    { encoding: 'jsonParsed', limit: 1000, ...(paginationKey ? { paginationKey } : {}) },
                ],
            }),
        });
        if (!response.ok) throw new Error(`getTokenAccountsByOwnerV2 HTTP ${response.status}`);
        const json: any = await response.json();
        if (json.error) throw new Error(`getTokenAccountsByOwnerV2: ${json.error.message}`);

        const { accounts, paginationKey: nextKey } = json.result.value;
        for (const acc of accounts) {
            const info = acc.account?.data?.parsed?.info;
            if (info && info.tokenAmount?.amount !== '0') {
                heldMints.push(new Web3PublicKey(info.mint));
            }
        }
        paginationKey = nextKey ?? null;
    } while (paginationKey);

    for (let i = 0; i < heldMints.length; i += 100) {
        const batch = heldMints.slice(i, i + 100);
        const mintAccounts = await web3Connection.getMultipleAccountsInfo(batch);
        for (let j = 0; j < batch.length; j++) {
            const accountInfo = mintAccounts[j];
            if (!accountInfo) continue;
            try {
                const mint = unpackMint(batch[j], accountInfo, TOKEN_2022_PROGRAM_ID);
                if (!mint.mintAuthority?.equals(SGT_MINT_AUTHORITY)) continue;
                if (!getMetadataPointerState(mint)?.metadataAddress?.equals(SGT_GROUP_ADDRESS)) continue;
                if (!getTokenGroupMemberState(mint)?.group?.equals(SGT_GROUP_ADDRESS)) continue;
                return batch[j].toBase58();
            } catch {
                continue;
            }
        }
    }
    return null;
}

/** How long a prepared collect transaction stays valid (blockhash lifetime is ~60-90s) */
const CLAIM_TTL_SECONDS = 75;

const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * Timestamped structured logging for mint diagnostics.
 * Never pass a serialized transaction to these.
 */
const log = (event: string, fields: Record<string, unknown> = {}) => {
    const parts = Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`[${new Date().toISOString()}] ${event}${parts ? ' ' + parts : ''}`);
};
const logError = (event: string, error: unknown, fields: Record<string, unknown> = {}) => {
    const parts = Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ');
    console.error(`[${new Date().toISOString()}] ${event}${parts ? ' ' + parts : ''}`, error);
};

/**
 * `name`, cut with "…" to Bubblegum's 32 bytes: a longer name fails the mint on-chain.
 */
function fitName(name: unknown): string {
    const clean = String(name ?? '').trim() || 'NextVibe'
    if (Buffer.byteLength(clean, 'utf8') <= MAX_NAME_BYTES) return clean
    let chars = [...clean]
    while (chars.length && Buffer.byteLength(chars.join('') + '…', 'utf8') > MAX_NAME_BYTES) chars = chars.slice(0, -1)
    return chars.join('').trimEnd() + '…'
}

/**
 * The metadata URIs /mint/meet accepts: the meet's shared JSON (leaves minted
 * for a v2 selfie) or one holder's copy (every collectible recorded at a tap).
 */
function isMeetUri(uri: unknown, slug: string): boolean {
    if (typeof uri !== 'string' || !uri.startsWith(MEET_METADATA_PREFIX) || Buffer.byteLength(uri, 'utf8') > MAX_URI_BYTES) return false
    const path = uri.slice(MEET_METADATA_PREFIX.length)
    return path === `${slug}.json` || (MEET_HOLDER_PATH_RE.test(path) && path.startsWith(`${slug}/`))
}

/**
 * Without preflight a rejected mint still confirms: never report a leaf that isn't there.
 */
function assertLanded(result: any) {
    if (result?.result?.value?.err) {
        throw new Error(`mint failed on-chain: ${JSON.stringify(result.result.value.err)}`)
    }
}

/**
 * Single in-process mutex so leaf indices cannot interleave.
 */
let mintChain: Promise<unknown> = Promise.resolve()
function withMintLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = mintChain.then(fn, fn)
    mintChain = run.catch(() => {})
    return run
}

/**
 * Reads numMinted and deterministically derives the cNFT asset ID for the next leaf.
 */
async function nextLeaf(merkleTree: PublicKey) {
    const cfg = await fetchTreeConfigFromSeeds(umi, { merkleTree })
    const leafIndex = Number(cfg.numMinted)
    const [assetId] = findLeafAssetIdPda(umi, { merkleTree, leafIndex })
    return { leafIndex, assetId }
}

/**
 * Creators of a Proof of Meet leaf: the NextVibe authority, verified, with
 * the whole share (royalties are 0 anyway), then the wallets of the two
 * people who met, unverified with share 0. They don't sign the mint, but
 * the leaf names them on-chain for good, so every copy shows which two
 * wallets met. Bubblegum refuses a creator listed twice.
 */
function meetCreators(coAuthors: string[]) {
    const authority = umi.identity.publicKey
    const people = [...new Set(coAuthors)].filter((address) => address !== authority)
    return [
        { address: authority, verified: true, share: 100 },
        ...people.map((address) => ({ address: publicKey(address), verified: false, share: 0 })),
    ]
}

/**
 * Builds an SPL Memo instruction that lists the user's wallet as a required
 * signer. The Memo program verifies every account on the instruction has
 * signed the transaction, which makes the collect a user-signed transaction
 * while the backend identity stays the fee payer.
 */
const memoWithUserSigner = (memo: string, userPubkey: string) => {
    const user = publicKey(userPubkey);
    return {
        instruction: {
            programId: MEMO_PROGRAM_ID,
            keys: [{ pubkey: user, isSigner: true, isWritable: false }],
            data: new Uint8Array(Buffer.from(memo, 'utf8')),
        },
        signers: [createNoopSigner(user)],
        bytesCreatedOnChain: 0,
    };
};

new Elysia()

    /**
     * GET /tree
     *
     * How full the Merkle tree is. The Django queue checks it before each
     * batch (it never starts one the tree can't finish) and alerts at 80 %.
     */
    .get("/tree", async ({ set }: { set: any }) => {
        try {
            const cfg = await fetchTreeConfigFromSeeds(umi, { merkleTree: publicKey(MERKLE_TREE_ADDRESS) })
            const capacity = Number(cfg.totalMintCapacity)
            const minted = Number(cfg.numMinted)
            return { success: true, tree: MERKLE_TREE_ADDRESS, capacity, minted, remaining: Math.max(0, capacity - minted) }
        } catch (error) {
            logError("tree.status_failed", error, {})
            set.status = 502
            return { success: false, error: "TREE_STATUS_FAILED" }
        }
    })

    /**
     * POST /mint
     *
     * Mints a compressed NFT (cNFT) and verifies it against the NextVibe 
     * collection in a single transaction. Deterministic asset ID computation
     * via nextLeaf under withMintLock eliminates transaction parsing latency.
     *
     * @body recipient  - Solana wallet address of the user receiving the cNFT
     * @body postId     - NextVibe post ID to mint as an NFT
     * @body edition    - Edition number
     */
    .post("/mint", async ({ body, set }: { body: any, set: any }) => {
        const { recipient, postId, edition } = body
        log("mint.request", { postId, edition, recipient })

        /**
         * Fetch dynamic metadata from the NextVibe API.
         */
        let meta: any
        try {
            const metaResponse = await fetch(
                `https://api.nextvibe.io/api/v1/posts/${postId}/metadata/${edition}/`
            )
            if (!metaResponse.ok) {
                logError("mint.metadata_failed", `HTTP ${metaResponse.status}`, { postId, edition })
                set.status = 502
                return { success: false, error: "METADATA_FETCH_FAILED" }
            }
            meta = await metaResponse.json()
            log("mint.metadata_ok", { postId, edition, name: meta.name })
        } catch (error) {
            logError("mint.metadata_failed", error, { postId, edition })
            set.status = 502
            return { success: false, error: "METADATA_FETCH_FAILED" }
        }

        try {
            const startedAt = Date.now()
            const { signature, assetId } = await withMintLock(async () => {
                const leafInfo = await nextLeaf(publicKey(MERKLE_TREE_ADDRESS))
                const result = await mintToCollectionV1(umi, {
                    leafOwner: publicKey(recipient),
                    merkleTree: publicKey(MERKLE_TREE_ADDRESS),
                    collectionMint: publicKey(COLLECTION_ADDRESS),
                    collectionAuthority: umi.identity,
                    metadata: {
                        name: fitName(meta.name),
                        uri: `https://api.nextvibe.io/api/v1/posts/${postId}/metadata/${edition}/`,
                        sellerFeeBasisPoints: 500,
                        collection: { key: publicKey(COLLECTION_ADDRESS), verified: false },
                        creators: [],
                    },
                }).sendAndConfirm(umi, {
                    send: { skipPreflight: true, maxRetries: 3 },
                    confirm: { commitment: "confirmed" },
                })
                assertLanded(result)
                return { signature: result.signature, assetId: leafInfo.assetId.toString() }
            })

            log("mint.confirmed", {
                postId, edition,
                signature: bs58.encode(signature),
                assetId,
                ms: Date.now() - startedAt,
            })

            return {
                success: true,
                signature: Buffer.from(signature).toString('base64'),
                assetId,
            }
        } catch (error) {
            logError("mint.send_failed", error, { postId, edition, recipient })
            set.status = 502
            return { success: false, error: "MINT_SEND_FAILED" }
        }
    })

    /**
     * POST /mint/og
     *
     * Mints a compressed OG NFT (cNFT) and verifies it against the NextVibe
     * OG collection in a single transaction with deterministic asset ID computation.
     *
     * @body recipient  - Solana wallet address of the user receiving the OG cNFT
     * @body userId     - NextVibe user ID used to generate personalized OG metadata
     * @body edition    - Edition number of the OG NFT
     */
    .post("/mint/og", async ({ body, set }: { body: any, set: any }) => {
        const { recipient, userId, edition } = body;

        if (edition > 25){
            return {
                success: false,
                error: "Edition can't be > 25."
            }
        }

        const metaUrl = `https://api.nextvibe.io/api/v1/posts/0/metadata/${edition}?isOg=true&userId=${userId}`
        let meta: any
        try {
            const metaResponse = await fetch(metaUrl);
            if (!metaResponse.ok) {
                logError("mint_og.metadata_failed", `HTTP ${metaResponse.status}`, { userId, edition })
                set.status = 502
                return { success: false, error: "METADATA_FETCH_FAILED" }
            }
            meta = await metaResponse.json();
        } catch (error) {
            logError("mint_og.metadata_failed", error, { userId, edition })
            set.status = 502
            return { success: false, error: "METADATA_FETCH_FAILED" }
        }

        try {
            const startedAt = Date.now()
            const { signature, assetId } = await withMintLock(async () => {
                const leafInfo = await nextLeaf(publicKey(MERKLE_TREE_ADDRESS))
                const result = await mintToCollectionV1(umi, {
                    leafOwner: publicKey(recipient),
                    merkleTree: publicKey(MERKLE_TREE_ADDRESS),
                    collectionMint: publicKey(OG_COLLECTION_ADDRESS),
                    collectionAuthority: umi.identity,
                    metadata: {
                        name: fitName(meta.name),
                        uri: metaUrl,
                        sellerFeeBasisPoints: 500,
                        collection: { key: publicKey(OG_COLLECTION_ADDRESS), verified: false },
                        creators: [{ address: umi.identity.publicKey, verified: true, share: 100 }],
                    },
                }).sendAndConfirm(umi, {
                    send: { skipPreflight: true, maxRetries: 3 },
                    confirm: { commitment: "confirmed" },
                })
                assertLanded(result)
                return { signature: result.signature, assetId: leafInfo.assetId.toString() }
            })

            log("mint_og.confirmed", {
                userId, edition,
                signature: bs58.encode(signature),
                assetId,
                ms: Date.now() - startedAt,
            })

            return {
                success: true,
                signature: Buffer.from(signature).toString('base64'),
                assetId,
            }
        } catch (error) {
            logError("mint_og.send_failed", error, { userId, edition, recipient })
            set.status = 502
            return { success: false, error: "MINT_SEND_FAILED" }
        }
    })

    /**
     * POST /mint/meet
     *
     * Mints one Proof of Meet cNFT (one leaf per person who met) into the
     * Proof of Meet collection. Backend-signed and gasless like /mint/og. The
     * name and metadata URI come from the Django backend, which serves the
     * JSON (api.nextvibe.io/meta/meet/<slug>.json) and the image; nothing is
     * fetched here. Creators: the NextVibe authority (verified, 100 %) and
     * both people's wallets as co-authors (unverified, 0 %), see
     * meetCreators; no royalties.
     *
     * @body recipient - wallet of the person receiving this leaf
     * @body slug      - the meet's slug (12 characters)
     * @body name      - on-chain name, at most 32 bytes
     * @body uri       - `${MEET_METADATA_PREFIX}<slug>/<user id>.json` (the holder's
     *                   copy, recorded at the tap) or `${MEET_METADATA_PREFIX}<slug>.json`
     * @body coAuthors - the two people's wallets (one while the other has
     *                   none yet), the recipient's among them
     */
    .post("/mint/meet", async ({ body, set }: { body: any, set: any }) => {
        const { recipient, slug, name, uri } = body || {};
        // A backend from before co-authors sends none: the recipient alone
        const coAuthors = body?.coAuthors ?? [recipient];
        if (!MEET_COLLECTION_ADDRESS) {
            logError("mint_meet.rejected", "MEET_COLLECTION_NOT_CONFIGURED", { slug })
            set.status = 503
            return { success: false, error: "MEET_COLLECTION_NOT_CONFIGURED" }
        }
        const valid = typeof recipient === 'string' && SOLANA_ADDRESS_RE.test(recipient)
            && typeof slug === 'string' && MEET_SLUG_RE.test(slug)
            && typeof name === 'string' && name.length > 0 && Buffer.byteLength(name, 'utf8') <= MAX_NAME_BYTES
            && isMeetUri(uri, slug)
            && Array.isArray(coAuthors) && coAuthors.length >= 1 && coAuthors.length <= MAX_MEET_CO_AUTHORS
            && coAuthors.every((address: unknown) => typeof address === 'string' && SOLANA_ADDRESS_RE.test(address) && isPublicKey(address))
            && coAuthors.includes(recipient)
        if (!valid) {
            logError("mint_meet.rejected", "INVALID_REQUEST", { slug, recipient, coAuthors })
            set.status = 400
            return { success: false, error: "INVALID_REQUEST" }
        }
        log("mint_meet.request", { slug, recipient, coAuthors })

        try {
            const startedAt = Date.now()
            const { signature, assetId } = await withMintLock(async () => {
                const leafInfo = await nextLeaf(publicKey(MERKLE_TREE_ADDRESS))
                const result = await mintToCollectionV1(umi, {
                    leafOwner: publicKey(recipient),
                    merkleTree: publicKey(MERKLE_TREE_ADDRESS),
                    collectionMint: publicKey(MEET_COLLECTION_ADDRESS),
                    collectionAuthority: umi.identity,
                    metadata: {
                        name,
                        symbol: 'NVMEET',
                        uri,
                        sellerFeeBasisPoints: 0,
                        collection: { key: publicKey(MEET_COLLECTION_ADDRESS), verified: false },
                        creators: meetCreators(coAuthors),
                    },
                }).sendAndConfirm(umi, {
                    send: { skipPreflight: true, maxRetries: 3 },
                    confirm: { commitment: "confirmed" },
                })
                assertLanded(result)
                return { signature: result.signature, assetId: leafInfo.assetId.toString() }
            })

            log("mint_meet.confirmed", {
                slug,
                signature: bs58.encode(signature),
                assetId,
                ms: Date.now() - startedAt,
            })

            return {
                success: true,
                signature: Buffer.from(signature).toString('base64'),
                assetId,
            }
        } catch (error) {
            logError("mint_meet.send_failed", error, { slug, recipient })
            set.status = 502
            return { success: false, error: "MINT_SEND_FAILED" }
        }
    })

    /**
     * POST /collect/prepare
     *
     * Builds a free-collect transaction: mintToCollectionV1 (backend pays,
     * backend is collection authority) plus an SPL Memo instruction that
     * requires the collecting user's signature. Derives the expected leafIndex
     * and assetId for zero-delay persistence on the Django backend.
     *
     * @body recipient  - Wallet address receiving the cNFT (leaf owner)
     * @body postId     - NextVibe post ID being collected
     * @body edition    - Edition number reserved by the Django backend
     * @body memo       - Memo string built by the Django backend
     * @body userPubkey - Wallet address that must co-sign (same as recipient)
     */
    .post("/collect/prepare", async ({ body, set }: { body: any, set: any }) => {
        const { recipient, postId, edition, memo, userPubkey } = body
        log("collect.prepare.request", { postId, edition, recipient })

        if (!recipient || !postId || !edition || !memo || !userPubkey) {
            logError("collect.prepare.rejected", "MISSING_FIELDS", { postId, edition })
            set.status = 400
            return { success: false, error: "MISSING_FIELDS" }
        }

        let meta: any
        try {
            const metaResponse = await fetch(
                `https://api.nextvibe.io/api/v1/posts/${postId}/metadata/${edition}/`
            )
            if (!metaResponse.ok) throw new Error(`HTTP ${metaResponse.status}`)
            meta = await metaResponse.json()
        } catch (error) {
            logError("collect.prepare.metadata_failed", error, { postId, edition })
            set.status = 502
            return { success: false, error: "METADATA_FETCH_FAILED" }
        }

        const builder = mintToCollectionV1(umi, {
            leafOwner: publicKey(recipient),
            merkleTree: publicKey(MERKLE_TREE_ADDRESS),
            collectionMint: publicKey(COLLECTION_ADDRESS),
            collectionAuthority: umi.identity,
            metadata: {
                name: meta.name,
                uri: `https://api.nextvibe.io/api/v1/posts/${postId}/metadata/${edition}/`,
                sellerFeeBasisPoints: 500,
                collection: { key: publicKey(COLLECTION_ADDRESS), verified: false },
                creators: [],
            },
        })
            .add(memoWithUserSigner(memo, userPubkey))
            .setFeePayer(umi.identity)

        try {
            const { leafIndex, assetId } = await nextLeaf(publicKey(MERKLE_TREE_ADDRESS))
            const tx = await builder.buildWithLatestBlockhash(umi)
            const partiallySigned = await umi.identity.signTransaction(tx)
            const messageHash = sha256Hex(tx.serializedMessage)
            const expiresAt = new Date(Date.now() + CLAIM_TTL_SECONDS * 1000).toISOString()

            log("collect.prepare.built", {
                postId, edition,
                blockhash: tx.message.blockhash,
                messageHash,
                assetId: assetId.toString(),
                leafIndex,
                expiresAt,
                memoLen: memo.length,
            })

            return {
                success: true,
                transaction: Buffer.from(umi.transactions.serialize(partiallySigned)).toString('base64'),
                messageHash,
                blockhash: tx.message.blockhash,
                expiresAt,
                assetId: assetId.toString(),
                leafIndex,
            }
        } catch (error) {
            logError("collect.prepare.build_failed", error, { postId, edition })
            set.status = 502
            return { success: false, error: "PREPARE_FAILED" }
        }
    })

    /**
     * POST /collect/submit
     *
     * Receives the fully signed collect transaction back from the client,
     * verifies it was not tampered with (message hash) and that every
     * required signer signed, then broadcasts with skipPreflight: true and confirms.
     * Verifies the minted asset ID in a single confirmed parse attempt.
     *
     * @body signedTransaction - base64 transaction signed by backend + user
     * @body messageHash       - hash returned by /collect/prepare
     * @body expectedAssetId   - (optional) precalculated asset ID from /collect/prepare
     * @body postId            - (optional) post ID, for logging only
     * @body edition           - (optional) edition number, for logging only
     */
    .post("/collect/submit", async ({ body, set }: { body: any, set: any }) => {
        const { signedTransaction, messageHash, expectedAssetId, postId, edition } = body
        log("collect.submit.request", { postId, edition })

        if (!signedTransaction || !messageHash) {
            logError("collect.submit.rejected", "MISSING_FIELDS", { postId, edition })
            set.status = 400
            return { success: false, error: "MISSING_FIELDS" }
        }

        let tx
        try {
            tx = umi.transactions.deserialize(new Uint8Array(Buffer.from(signedTransaction, 'base64')))
        } catch (error) {
            logError("collect.submit.deserialize_failed", error, { postId, edition })
            set.status = 400
            return { success: false, error: "INVALID_TRANSACTION" }
        }

        // The signed message must be byte-identical to what /collect/prepare built.
        const actualHash = sha256Hex(tx.serializedMessage)
        if (actualHash !== messageHash) {
            logError("collect.submit.rejected", "TX_TAMPERED", {
                postId, edition, expectedHash: messageHash, actualHash,
            })
            set.status = 400
            return { success: false, error: "TX_TAMPERED" }
        }

        // Every required signer (fee payer + memo signer) must carry a valid signature.
        const requiredSigners = tx.message.accounts.slice(0, tx.message.header.numRequiredSignatures)
        for (let i = 0; i < requiredSigners.length; i++) {
            const sig = tx.signatures[i]
            const valid = sig
                && sig.some((byte) => byte !== 0)
                && umi.eddsa.verify(tx.serializedMessage, sig, requiredSigners[i])
            if (!valid) {
                logError("collect.submit.rejected", "USER_SIGNATURE_MISSING", {
                    postId, edition,
                    signerIndex: i,
                    signer: requiredSigners[i],
                    signaturePresent: !!(sig && sig.some((byte: number) => byte !== 0)),
                })
                set.status = 400
                return { success: false, error: "USER_SIGNATURE_MISSING" }
            }
        }
        log("collect.submit.verified", { postId, edition, signers: requiredSigners.length })

        let signature: Uint8Array
        try {
            const startedAt = Date.now()
            signature = await umi.rpc.sendTransaction(tx, { skipPreflight: true, maxRetries: 3 })
            log("collect.submit.sent", { postId, edition, signature: bs58.encode(signature) })
            const latest = await umi.rpc.getLatestBlockhash()
            await umi.rpc.confirmTransaction(signature, {
                strategy: { type: 'blockhash', ...latest },
                commitment: 'confirmed',
            })
            log("collect.submit.confirmed", {
                postId, edition,
                signature: bs58.encode(signature),
                ms: Date.now() - startedAt,
            })
        } catch (error: any) {
            const msg = String(error?.message ?? error)
            if (/blockhash/i.test(msg) || /block height exceeded/i.test(msg)) {
                logError("collect.submit.expired", msg, { postId, edition })
                set.status = 410
                return { success: false, error: "CLAIM_EXPIRED" }
            }
            logError("collect.submit.send_failed", error, { postId, edition })
            set.status = 502
            return { success: false, error: "SEND_FAILED" }
        }

        // One-shot verification against confirmed RPC wrapper without retry delays
        let assetId: string | null = expectedAssetId ?? null;
        try {
            const leaf = await parseLeafFromMintToCollectionV1Transaction(umiConfirmed, signature);
            const parsedId = leaf.id.toString();
            if (expectedAssetId && parsedId !== expectedAssetId) {
                log("collect.assetid.mismatch", {
                    postId, edition,
                    expected: expectedAssetId,
                    actual: parsedId,
                });
            }
            assetId = parsedId;
        } catch (error) {
            log("collect.submit.parse_delayed", {
                postId, edition,
                signature: bs58.encode(signature),
            });
        }

        log("collect.submit.done", { postId, edition, assetId: assetId ?? "null", signature: bs58.encode(signature) })

        return {
            success: true,
            signature: Buffer.from(signature).toString('base64'),
            assetId,
        }
    })

    /**
     * POST /asset-id-from-signature
     *
     * Parses the cNFT asset ID and leaf index from a confirmed transaction signature.
     * Used by the backfill command to resolve any unparsed historic records.
     *
     * @body signature - base64 or base58 encoded transaction signature
     */
    .post("/asset-id-from-signature", async ({ body, set }: { body: any, set: any }) => {
        const { signature } = body || {};
        if (!signature) {
            set.status = 400;
            return { success: false, error: "MISSING_SIGNATURE" };
        }
        try {
            let sigBytes: Uint8Array;
            if (typeof signature === 'string') {
                if (signature.length > 64 && !signature.includes('/') && !signature.includes('+')) {
                    sigBytes = bs58.decode(signature);
                } else {
                    try {
                        sigBytes = new Uint8Array(Buffer.from(signature, 'base64'));
                        if (sigBytes.length !== 64) {
                            sigBytes = bs58.decode(signature);
                        }
                    } catch {
                        sigBytes = bs58.decode(signature);
                    }
                }
            } else {
                sigBytes = new Uint8Array(signature);
            }

            const leaf = await parseLeafFromMintToCollectionV1Transaction(umiConfirmed, sigBytes);
            return {
                success: true,
                assetId: leaf.id.toString(),
                nonce: Number(leaf.nonce),
            };
        } catch (error) {
            logError("asset_id_from_signature.failed", error, { signature });
            set.status = 404;
            return { success: false, error: "ASSET_ID_NOT_FOUND" };
        }
    })

    /**
     * POST /seeker/sgt-check
     *
     * Checks whether a wallet currently holds a Seeker Genesis Token
     * (non-transferable Token-2022 NFT minted per Seeker device).
     *
     * @body wallet - Solana wallet address to scan
     * @returns { success: true, sgtMint: string | null }
     */
    .post("/seeker/sgt-check", async ({ body, set }: { body: any, set: any }) => {
        const { wallet } = body || {};
        if (!wallet || typeof wallet !== 'string' || !SOLANA_ADDRESS_RE.test(wallet)) {
            set.status = 400;
            return { success: false, error: "INVALID_WALLET" };
        }
        log("seeker.sgt_check.request", { wallet });
        try {
            const sgtMint = await findSgtMint(wallet);
            log("seeker.sgt_check.done", { wallet, sgtMint: sgtMint ?? "none" });
            return { success: true, sgtMint };
        } catch (error) {
            logError("seeker.sgt_check.failed", error, { wallet });
            set.status = 502;
            return { success: false, error: "SGT_CHECK_FAILED" };
        }
    })

    .listen(3000)

console.log("NFT service running on port 3000")