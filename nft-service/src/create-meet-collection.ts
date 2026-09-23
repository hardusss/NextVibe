/**
 * One-off: creates the "NextVibe Proof of Meet" collection NFT, the parent of
 * every Proof of Meet cNFT (POST /mint/meet). Run it once on the server,
 * then set MEET_COLLECTION_ADDRESS in the nft-service environment and
 * restart it:
 *
 *   bun run src/create-meet-collection.ts
 *
 * The backend keypair (SOLANA_PRIVATE_KEY) pays the rent (~0.02 SOL) and
 * stays the collection's update authority, as for the other collections.
 */
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { mplTokenMetadata, createNft } from '@metaplex-foundation/mpl-token-metadata'
import { keypairIdentity, generateSigner, percentAmount } from '@metaplex-foundation/umi'
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { config } from "dotenv"
config();

if (process.env.MEET_COLLECTION_ADDRESS) {
    console.log("MEET_COLLECTION_ADDRESS is already set:", process.env.MEET_COLLECTION_ADDRESS)
    console.log("Unset it first if you really want a second collection.")
    process.exit(1)
}

const keypair = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY!))

const umi = createUmi(process.env.HELIUS_RPC_URL!)
    .use(mplTokenMetadata())
    .use(keypairIdentity(fromWeb3JsKeypair(keypair)))

const collectionMint = generateSigner(umi)

const { signature } = await createNft(umi, {
    mint: collectionMint,
    name: "NextVibe Proof of Meet",
    symbol: "NVMEET",
    uri: "https://api.nextvibe.io/api/v1/posts/collection/metadata/?kind=meet",
    sellerFeeBasisPoints: percentAmount(0),
    isCollection: true,
}).sendAndConfirm(umi)

console.log("Proof of Meet collection created")
console.log("MEET_COLLECTION_ADDRESS=" + collectionMint.publicKey)
console.log("Signature:", bs58.encode(signature))
