import { Elysia } from "elysia";
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import {
    mplBubblegum,
    mintToCollectionV1,
    parseLeafFromMintToCollectionV1Transaction,
} from '@metaplex-foundation/mpl-bubblegum'
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { publicKey, keypairIdentity, createNoopSigner } from '@metaplex-foundation/umi'
import { createHash } from 'node:crypto'
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { config } from 'dotenv'

config()

/**
 * Helper function to pause execution for a given number of milliseconds.
 * This is used to give the RPC node time to index transaction logs.
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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
 * Builds an SPL Memo instruction that lists the user's wallet as a required
 * signer. The Memo program verifies every account on the instruction has
 * signed the transaction, which makes the collect a user-signed transaction
 * while the backend identity stays the fee payer.
 *
 * Note: mpl-toolbox's addMemo() does not expose signer accounts, so the
 * instruction is built directly with umi primitives.
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
     * collection in a single transaction. The recipient receives the NFT 
     * without needing to sign.
     *
     * @body recipient  - Solana wallet address of the user receiving the cNFT
     * @body postId     - NextVibe post ID to mint as an NFT
     * @body edition    - Edition number
     */
    .post("/mint", async ({ body }: { body: any }) => {
        const { recipient, postId, edition } = body

        /**
         * Fetch dynamic metadata from the NextVibe API.
         */
        const metaResponse = await fetch(
            `https://api.nextvibe.io/api/v1/posts/${postId}/metadata/${edition}/`
        )
        const meta = await metaResponse.json()

        /**
         * Step 1: Mint and Verify in a Single Transaction
         * mintToCollectionV1 handles both inserting the leaf into the Merkle tree
         * and verifying it against the collection in one go.
         */
        const { signature } = await mintToCollectionV1(umi, {
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
            confirm: { commitment: "confirmed" },
        })

        /**
         * Step 2: Extract the Asset ID with a Retry Mechanism
         * Even with 'finalized' commitment, RPC nodes often need a moment 
         * to index the transaction logs. We retry parsing to avoid race conditions.
         */
        let assetId = null;
        let retries = 6;
        let delayMs = 500;

        while (retries > 0) {
            try {
                // Wait before attempting to parse the transaction logs
                await delay(delayMs);

                const leaf = await parseLeafFromMintToCollectionV1Transaction(umi, signature);
                assetId = leaf.id;

                // Break out of the loop if parsing is successful
                break;
            } catch (error) {
                retries--;
                delayMs = 1500; // Increase delay for subsequent retries
                if (retries === 0) {
                    console.error("Failed to parse leaf from transaction after all attempts.", error);
                }
            }
        }

        return {
            success: true,
            signature: Buffer.from(signature).toString('base64'),
            assetId: assetId || "Minted successfully, but RPC delayed asset ID parsing",
        }
    })

    /**
     * POST /mint/og
     *
     * Mints a compressed OG NFT (cNFT) and verifies it against the NextVibe
     * OG collection in a single transaction. Intended for early/founding users
     * receiving a special OG edition badge. The recipient receives the NFT
     * without needing to sign.
     *
     * @body recipient  - Solana wallet address of the user receiving the OG cNFT
     * @body userId     - NextVibe user ID used to generate personalized OG metadata
     * @body edition    - Edition number of the OG NFT
     */
    .post("/mint/og", async ({ body }: { body: any }) => {
        const { recipient, userId, edition } = body;

        if (edition > 25){
            return {
                success: false,
                error: "Edition can't be > 25."
            }
        }
        /**
         * Fetch dynamic og metadata from the NextVibe API.
         */
        const metaUrl = `https://api.nextvibe.io/api/v1/posts/0/metadata/${edition}?isOg=true&userId=${userId}`
        const metaResponse = await fetch(
            metaUrl
        );
        const meta = await metaResponse.json();

        const { signature } = await mintToCollectionV1(umi, {
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
            confirm: { commitment: "confirmed" },
        });

        let assetId = null;
        let retries = 6;
        let delayMs = 500;

        while (retries > 0) {
            try {
                // Wait before attempting to parse the transaction logs
                await delay(delayMs);

                const leaf = await parseLeafFromMintToCollectionV1Transaction(umi, signature);
                assetId = leaf.id;

                // Break out of the loop if parsing is successful
                break;
            } catch (error) {
                retries--;
                delayMs = 1500; // Increase delay for subsequent retries
                if (retries === 0) {
                    console.error("Failed to parse leaf from transaction after all attempts.", error);
                }
            }
        }

        return {
            success: true,
            signature: Buffer.from(signature).toString('base64'),
            assetId: assetId || "Minted successfully, but RPC delayed asset ID parsing",
        }

    })

    /**
     * POST /collect/prepare
     *
     * Builds a free-collect transaction: mintToCollectionV1 (backend pays,
     * backend is collection authority) plus an SPL Memo instruction that
     * requires the collecting user's signature. The transaction is partially
     * signed by the backend identity and returned base64-encoded so the
     * client can add the user's signature via MWA / Seed Vault.
     *
     * @body recipient  - Wallet address receiving the cNFT (leaf owner)
     * @body postId     - NextVibe post ID being collected
     * @body edition    - Edition number reserved by the Django backend
     * @body memo       - Memo string built by the Django backend
     * @body userPubkey - Wallet address that must co-sign (same as recipient)
     */
    .post("/collect/prepare", async ({ body, set }: { body: any, set: any }) => {
        const { recipient, postId, edition, memo, userPubkey } = body

        if (!recipient || !postId || !edition || !memo || !userPubkey) {
            set.status = 400
            return { success: false, error: "MISSING_FIELDS" }
        }

        const metaResponse = await fetch(
            `https://api.nextvibe.io/api/v1/posts/${postId}/metadata/${edition}/`
        )
        const meta = await metaResponse.json()

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

        // Fetch the blockhash as late as possible so the client gets the
        // full ~60-90s lifetime to sign and submit.
        const tx = await builder.buildWithLatestBlockhash(umi)
        const partiallySigned = await umi.identity.signTransaction(tx)

        return {
            success: true,
            transaction: Buffer.from(umi.transactions.serialize(partiallySigned)).toString('base64'),
            messageHash: sha256Hex(tx.serializedMessage),
            blockhash: tx.message.blockhash,
            expiresAt: new Date(Date.now() + CLAIM_TTL_SECONDS * 1000).toISOString(),
        }
    })

    /**
     * POST /collect/submit
     *
     * Receives the fully signed collect transaction back from the client,
     * verifies it was not tampered with (message hash) and that every
     * required signer — backend fee payer and user — actually signed,
     * then broadcasts and confirms it and parses the minted asset ID.
     *
     * @body signedTransaction - base64 transaction signed by backend + user
     * @body messageHash       - hash returned by /collect/prepare
     * @body postId            - (optional) post ID, for logging only
     * @body edition           - (optional) edition number, for logging only
     */
    .post("/collect/submit", async ({ body, set }: { body: any, set: any }) => {
        const { signedTransaction, messageHash, postId, edition } = body

        if (!signedTransaction || !messageHash) {
            set.status = 400
            return { success: false, error: "MISSING_FIELDS" }
        }

        let tx
        try {
            tx = umi.transactions.deserialize(new Uint8Array(Buffer.from(signedTransaction, 'base64')))
        } catch {
            set.status = 400
            return { success: false, error: "INVALID_TRANSACTION" }
        }

        // The signed message must be byte-identical to what /collect/prepare built.
        if (sha256Hex(tx.serializedMessage) !== messageHash) {
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
                set.status = 400
                return { success: false, error: "USER_SIGNATURE_MISSING" }
            }
        }

        let signature
        try {
            signature = await umi.rpc.sendTransaction(tx, { skipPreflight: false })
            const latest = await umi.rpc.getLatestBlockhash()
            await umi.rpc.confirmTransaction(signature, {
                strategy: { type: 'blockhash', ...latest },
                commitment: 'confirmed',
            })
        } catch (error: any) {
            const msg = String(error?.message ?? error)
            if (/blockhash/i.test(msg) || /block height exceeded/i.test(msg)) {
                set.status = 410
                return { success: false, error: "CLAIM_EXPIRED" }
            }
            console.error(`Collect submit failed for tx: ${msg}`)
            set.status = 502
            return { success: false, error: "SEND_FAILED" }
        }

        let assetId = null;
        let retries = 6;
        let delayMs = 500;

        while (retries > 0) {
            try {
                // Wait before attempting to parse the transaction logs
                await delay(delayMs);

                const leaf = await parseLeafFromMintToCollectionV1Transaction(umi, signature);
                assetId = leaf.id;

                break;
            } catch (error) {
                retries--;
                delayMs = 1500;
                if (retries === 0) {
                    console.error("Failed to parse leaf from transaction after all attempts.", error);
                }
            }
        }

        console.log(`Collect confirmed: postId=${postId} edition=${edition} signature=${bs58.encode(signature)}`)

        return {
            success: true,
            signature: Buffer.from(signature).toString('base64'),
            assetId: assetId || "Minted successfully, but RPC delayed asset ID parsing",
        }
    })
    .listen(3000)

console.log("NFT service running on port 3000")