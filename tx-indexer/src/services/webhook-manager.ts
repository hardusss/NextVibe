import { env } from "../config/env";

const HELIUS_API_BASE = "https://api.helius.xyz";

type HeliusWebhook = {
  webhookID: string;
  webhookURL: string;
  accountAddresses: string[];
  transactionTypes: string[];
  webhookType: string;
};

async function heliusWebhookRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${HELIUS_API_BASE}${path}${separator}api-key=${env.HELIUS_API_KEY}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Helius Webhook API ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function getWebhook(): Promise<HeliusWebhook> {
  return heliusWebhookRequest<HeliusWebhook>(`/v0/webhooks/${env.HELIUS_WEBHOOK_ID}`);
}

export async function addAddressToWebhook(address: string): Promise<void> {
  const webhook = await getWebhook();
  const currentAddresses = webhook.accountAddresses ?? [];

  if (currentAddresses.includes(address)) {
    return;
  }

  await heliusWebhookRequest(`/v0/webhooks/${env.HELIUS_WEBHOOK_ID}`, {
    method: "PUT",
    body: JSON.stringify({
      webhookURL: env.HELIUS_WEBHOOK_URL,
      accountAddresses: [...currentAddresses, address],
      transactionTypes: ["Any"],
      webhookType: "enhanced",
      authHeader: `Bearer ${env.HELIUS_WEBHOOK_SECRET}`,
    }),
  });
}

export async function ensureWebhookConfigured(): Promise<void> {
  const webhook = await getWebhook();

  if (webhook.webhookURL !== env.HELIUS_WEBHOOK_URL) {
    console.warn(
      `[webhook-manager] Helius webhook URL mismatch: expected ${env.HELIUS_WEBHOOK_URL}, got ${webhook.webhookURL}`
    );
  }
}
