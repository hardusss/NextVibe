import { countTransactionsByAddress, getWalletAddresses, getSyncCursor } from "../db/queries";
import { enqueueFetchInitial } from "../queue";
import {
  ensureWebhookConfigured,
  syncWebhookAddresses,
} from "../services/webhook-manager";
import { env } from "../config/env";

export type InitialSyncResult = {
  wallets: number;
  queued: number;
  skipped: number;
  webhookSynced: number;
  webhookTruncated: boolean;
};

export async function runInitialSync(
  options: { force?: boolean } = {}
): Promise<InitialSyncResult> {
  const force = options.force ?? false;
  console.log(`[initial-sync] starting... (force=${force})`);

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
      const cursor = await getSyncCursor(address);

      if (!force && (cursor?.status === "done" || cursor?.status === "syncing" || cursor?.status === "idle")) {
        skipped += 1;
        continue;
      }

      await enqueueFetchInitial(address, env.INITIAL_FETCH_LIMIT);
      queued += 1;
    } catch (error) {
      console.error(`[initial-sync] queue failed for ${address}:`, error);
    }
  }

  let webhookSynced = 0;
  let webhookTruncated = false;

  try {
    const webhookResult = await syncWebhookAddresses(addresses);
    webhookSynced = webhookResult.synced;
    webhookTruncated = webhookResult.truncated;
    console.log(
      `[initial-sync] webhook pool updated: ${webhookSynced} addresses`
    );
  } catch (error) {
    console.error("[initial-sync] webhook sync failed:", error);
  }

  console.log(
    `[initial-sync] complete: queued=${queued}, skipped=${skipped}, total=${addresses.length}`
  );

  return {
    wallets: addresses.length,
    queued,
    skipped,
    webhookSynced,
    webhookTruncated,
  };
}
