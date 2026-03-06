import { Elysia } from "elysia";
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { mplBubblegum, mintV1 } from '@metaplex-foundation/mpl-bubblegum'
import { publicKey } from '@metaplex-foundation/umi'
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters'
import { keypairIdentity } from '@metaplex-foundation/umi'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { config } from 'dotenv'
config()

const keypair = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY!))
const umi = createUmi('https://api.devnet.solana.com')
  .use(mplBubblegum())
  .use(keypairIdentity(fromWeb3JsKeypair(keypair))) 

const COLLECTION_ADDRESS = process.env.COLLECTION_ADDRESS!
const MERKLE_TREE_ADDRESS = process.env.MERKLE_TREE_ADDRESS!

new Elysia()
  .post("/build-mint", async ({ body }: { body: any }) => {
    const { recipient, postId, edition } = body  

    // Get metadata from NextVibe API
    const metaResponse = await fetch(`https://api.nextvibe.io/api/v1/posts/${postId}/metadata/${edition}/`)
    const meta = await metaResponse.json()

    // Build transaction
    const builder = await mintV1(umi, {
      leafOwner: publicKey(recipient),
      merkleTree: publicKey(MERKLE_TREE_ADDRESS), 
      metadata: {
        name: meta.name,
        uri: `https://api.nextvibe.io/api/v1/posts/${postId}/metadata/${edition}/`,
        sellerFeeBasisPoints: meta.seller_fee_basis_points ?? 500,
        collection: { key: publicKey(COLLECTION_ADDRESS), verified: false },  
        creators: [],
      },
    })

    const transaction = await builder.buildWithLatestBlockhash(umi)
    const serialized = umi.transactions.serialize(transaction)

    return { transaction: Buffer.from(serialized).toString('base64') }
  })
  .listen(3000)

console.log("🦊 NFT service running on port 3000")