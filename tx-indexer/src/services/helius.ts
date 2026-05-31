import { createHmac } from "node:crypto";
import { env } from "../config/env";
import type { EnhancedTransaction } from "./types";

const HELIUS_API_BASE = "https://api.helius.xyz";

async function heliusFetch<T>(
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
    throw new Error(`Helius API ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function getEnhancedTransactions(
  address: string,
  limit: number = 10,
  before: string | null = null
): Promise<EnhancedTransaction[]> {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (before) {
    params.set("before", before);
  }

  return heliusFetch<EnhancedTransaction[]>(
    `/v0/addresses/${address}/transactions?${params.toString()}`
  );
}

export function extractWalletAddress(
  tx: EnhancedTransaction,
  fallback?: string
): string | null {
  if (fallback) return fallback;

  const feePayer = tx.feePayer?.trim();
  if (feePayer) return feePayer;

  const account = tx.accountData?.[0]?.account?.trim();
  return account || null;
}

export function parseWebhookBody(body: unknown): EnhancedTransaction[] {
  if (!Array.isArray(body)) {
    throw new Error("Webhook body must be an array");
  }

  return body as EnhancedTransaction[];
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false;

  const digest = createHmac("sha256", env.HELIUS_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  return digest === signatureHeader;
}
