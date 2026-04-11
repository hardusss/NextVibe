import { Elysia } from "elysia";
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import {
    mplBubblegum,
    mintToCollectionV1,
    parseLeafFromMintToCollectionV1Transaction,
} from '@metaplex-foundation/mpl-bubblegum'
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { publicKey, keypairIdentity } from '@metaplex-foundation/umi'
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
const umi = createUmi(process.env.HELIUS_RPC_URL!)
    .use(mplBubblegum())
    .use(mplTokenMetadata())
    .use(keypairIdentity(fromWeb3JsKeypair(keypair)))

/** Verified collection NFT address */
const COLLECTION_ADDRESS = process.env.COLLECTION_ADDRESS!

/** Merkle tree address for storing compressed NFT leaves */
const MERKLE_TREE_ADDRESS = process.env.MERKLE_TREE_ADDRESS!

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
            confirm: { commitment: "finalized" },
        })

        /**
         * Step 2: Extract the Asset ID with a Retry Mechanism
         * Even with 'finalized' commitment, RPC nodes often need a moment 
         * to index the transaction logs. We retry parsing to avoid race conditions.
         */
        let assetId = null;
        let retries = 3;

        while (retries > 0) {
            try {
                // Wait 1.5 seconds before attempting to parse the transaction logs
                await delay(1500);

                const leaf = await parseLeafFromMintToCollectionV1Transaction(umi, signature);
                assetId = leaf.id;

                // Break out of the loop if parsing is successful
                break;
            } catch (error) {
                retries--;
                if (retries === 0) {
                    console.error("Failed to parse leaf from transaction after 3 attempts.", error);
                }
            }
        }

        return {
            success: true,
            signature: Buffer.from(signature).toString('base64'),
            assetId: assetId || "Minted successfully, but RPC delayed asset ID parsing",
        }
    })

    .post("/mint/avatar", async ({ body }: { body: any }) => {
        const { recipient, userId, edition } = body;

        /**
         * Fetch dynamic og metadata from the NextVibe API.
         */
        const metaResponse = await fetch(
            `https://api.nextvibe.io/api/v1/posts/0/metadata/${edition}?isOg=true&userId=${userId}`
        );
        const meta = await metaResponse.json();

        

    })
    .listen(3000)

console.log("NFT service running on port 3000")