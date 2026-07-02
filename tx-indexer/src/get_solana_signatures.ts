import { Connection, PublicKey } from "@solana/web3.js";

async function main() {
  const address = "5EBkFN1Vuvr6ykswSZrjC9EuuHNCRuA59FLqYaJ9a3AZ";
  // Use Helius RPC endpoint
  const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=8b5d26aa-3554-4d0c-b716-c04029ca49c9");

  try {
    const pubkey = new PublicKey(address);
    const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 10 });
    console.log(`Solana blockchain signatures for ${address}:`);
    for (const s of sigs) {
      console.log(`- Signature: ${s.signature} | Slot: ${s.slot} | BlockTime: ${s.blockTime ? new Date(s.blockTime * 1000).toISOString() : "unknown"} | Error: ${JSON.stringify(s.err)}`);
    }
  } catch (err) {
    console.error("Solana query error:", err);
  } finally {
    process.exit(0);
  }
}

main();
