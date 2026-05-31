import { Elysia } from "elysia";
import { env } from "../config/env";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidSolanaAddress(address: string): boolean {
  return SOLANA_ADDRESS_RE.test(address);
}

export function internalAuthGuard(headers: Record<string, string | undefined>): void {
  const secret = headers["x-internal-secret"];

  if (!secret || secret !== env.INTERNAL_SECRET) {
    throw new Error("Unauthorized");
  }
}

export const internalAuthPlugin = new Elysia({ name: "internal-auth" }).derive(
  ({ headers, set }) => {
    try {
      internalAuthGuard(headers);
      return {};
    } catch {
      set.status = 401;
      throw new Error("Unauthorized");
    }
  }
);
