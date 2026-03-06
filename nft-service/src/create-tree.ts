import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { mplBubblegum, createTree } from '@metaplex-foundation/mpl-bubblegum'
import { keypairIdentity, generateSigner } from '@metaplex-foundation/umi'
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { config } from 'dotenv'
config()

const keypair = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY!))

const umi = createUmi('https://api.devnet.solana.com')
  .use(mplBubblegum())
  .use(keypairIdentity(fromWeb3JsKeypair(keypair)))

const merkleTree = generateSigner(umi)

const { signature } = await (await createTree(umi, {
  merkleTree,
  maxDepth: 20,        
  maxBufferSize: 256,  
  canopyDepth: 8,
})).sendAndConfirm(umi)

console.log("✅ Merkle Tree created!")
console.log("Address:", merkleTree.publicKey)
console.log("Signature:", Buffer.from(signature).toString('base64'))