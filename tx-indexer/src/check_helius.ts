import { getEnhancedTransactions } from "./services/helius";

async function main() {
  const address = "5EBkFN1Vuvr6ykswSZrjC9EuuHNCRuA59FLqYaJ9a3AZ";
  try {
    const txs = await getEnhancedTransactions(address, 10);
    console.log(`Fetched ${txs.length} transactions from Helius.`);
    for (const tx of txs) {
      console.log("--------------------------------------------------");
      console.log("Signature:", tx.signature);
      console.log("Type:", tx.type);
      console.log("Fee Payer:", tx.feePayer);
      console.log("Native Transfers:", JSON.stringify(tx.nativeTransfers, null, 2));
      console.log("Token Transfers:", JSON.stringify(tx.tokenTransfers, null, 2));
    }
  } catch (err) {
    console.error("Error fetching from Helius:", err);
  } finally {
    process.exit(0);
  }
}

main();
