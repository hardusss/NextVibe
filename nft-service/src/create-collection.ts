import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { mplTokenMetadata, createNft } from '@metaplex-foundation/mpl-token-metadata'
import {
    keypairIdentity,
    generateSigner,
    percentAmount
} from '@metaplex-foundation/umi'
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { config } from "dotenv"
config();

const privateKey = process.env.SOLANA_PRIVATE_KEY!
const keypair = Keypair.fromSecretKey(bs58.decode(privateKey))

const umi = createUmi('https://api.devnet.solana.com')
    .use(mplTokenMetadata())
    .use(keypairIdentity(fromWeb3JsKeypair(keypair)))

// Generate address collection
const collectionMint = generateSigner(umi)

// create collection
const { signature } = await createNft(umi, {
    mint: collectionMint,
    name: "NextVibe OG Status",
    symbol: "NVIBE",
    uri: "https://api.nextvibe.io/api/v1/posts/collection/metadata?isOg=true",
    sellerFeeBasisPoints: percentAmount(5),
    isCollection: true,
}).sendAndConfirm(umi)

console.log("Collection created")
console.log("Address", collectionMint.publicKey)
console.log("Signature:", Buffer.from(signature).toString('base64'))