import { countTransactionsByAddress, getWalletAddresses } from "../db/queries";
import { enqueueFetchInitial } from "../queue";
import { addAddressToWebhook, ensureWebhookConfigured } from "../services/webhook-manager";
import { env } from "../config/env";

export async function runInitialSync(): Promise<void> {
  console.log("[initial-sync] starting...");

  try {
    await ensureWebhookConfigured();
  } catch (error) {
    console.warn("[initial-sync] webhook check failed:", error);
  }

  const addresses = await getWalletAddresses();
  console.log(`[initial-sync] found ${addresses.length} wallet addresses`);

  let queued = 0;
  let skipped = 0;

  for (const address of addresses) {
    try {
      const count = await countTransactionsByAddress(address);

      if (count > 0) {
        skipped += 1;
      } else {
        await enqueueFetchInitial(address, env.INITIAL_FETCH_LIMIT);
        queued += 1;
      }

      await addAddressToWebhook(address);
    } catch (error) {
      console.error(`[initial-sync] failed for ${address}:`, error);
    }
  }

  console.log(
    `[initial-sync] complete: queued=${queued}, skipped=${skipped}, total=${addresses.length}`
  );
}
