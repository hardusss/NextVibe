import { Elysia } from "elysia";
import {
  extractWalletAddress,
  parseWebhookBody,
  verifyWebhookSignature,
} from "../services/helius";
import { enqueueWebhookTx } from "../queue";

export const webhookRoutes = new Elysia({ prefix: "/webhook" }).post(
  "/helius",
  async ({ request, set }) => {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get("helius-signature");

    if (!verifyWebhookSignature(rawBody, signatureHeader)) {
      set.status = 401;
      return { error: "Invalid webhook signature" };
    }

    let payload: ReturnType<typeof parseWebhookBody>;

    try {
      payload = parseWebhookBody(JSON.parse(rawBody));
    } catch (error) {
      set.status = 400;
      return {
        error: error instanceof Error ? error.message : "Invalid webhook payload",
      };
    }

    for (const tx of payload) {
      const address = extractWalletAddress(tx);
      if (!address) {
        console.warn("[webhook] skipped tx without address:", tx.signature);
        continue;
      }

      await enqueueWebhookTx(address, tx as unknown as Record<string, unknown>);
    }

    return { ok: true, queued: payload.length };
  }
);
