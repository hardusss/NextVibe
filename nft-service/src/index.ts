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
import { publicKey, keypairIdentity, createNoopSigner, PublicKey } from '@metaplex-foundation/umi'
import { createHash } from 'node:crypto'
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters'
import { Keypair } from '@solana/web3.js'
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
/** Merkle tree address for storing compressed NFT leaves */
const MERKLE_TREE_ADDRESS = process.env.MERKLE_TREE_ADDRESS!;

/** SPL Memo program */
const MEMO_PROGRAM_ID = publicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

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
                        name: meta.name,
                        uri: `https://api.nextvibe.io/api/v1/posts/${postId}/metadata/${edition}/`,
                        sellerFeeBasisPoints: 500,
                        collection: { key: publicKey(COLLECTION_ADDRESS), verified: false },
                        creators: [],
                    },
                }).sendAndConfirm(umi, {
                    send: { skipPreflight: true, maxRetries: 3 },
                    confirm: { commitment: "confirmed" },
                })
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
                        name: meta.name,
                        uri: metaUrl,
                        sellerFeeBasisPoints: 500,
                        collection: { key: publicKey(OG_COLLECTION_ADDRESS), verified: false },
                        creators: [],
                    },
                }).sendAndConfirm(umi, {
                    send: { skipPreflight: true, maxRetries: 3 },
                    confirm: { commitment: "confirmed" },
                })
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

    .listen(3000)

console.log("NFT service running on port 3000")