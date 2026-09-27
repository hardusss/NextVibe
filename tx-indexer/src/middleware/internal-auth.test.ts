import { beforeAll, describe, expect, test } from "bun:test";

let internalAuthGuard: (headers: Record<string, string | undefined>) => void;

beforeAll(async () => {
  // src/config/env.ts requires these at import time
  Object.assign(Bun.env, {
    INTERNAL_SECRET: "s3cret",
    HELIUS_API_KEY: "key",
    HELIUS_WEBHOOK_ID: "hook",
    HELIUS_WEBHOOK_SECRET: "hook-secret",
    HELIUS_WEBHOOK_URL: "https://indexer.example/webhook/helius",
    MYSQL_URL: "mysql://user:pass@127.0.0.1:3306/db",
  });
  ({ internalAuthGuard } = await import("./internal-auth"));
});

describe("internalAuthGuard", () => {
  test("accepts the shared secret", () => {
    expect(() => internalAuthGuard({ "x-internal-secret": "s3cret" })).not.toThrow();
  });

  test("refuses a missing or wrong secret", () => {
    expect(() => internalAuthGuard({})).toThrow("Unauthorized");
    expect(() => internalAuthGuard({ "x-internal-secret": "s3cre" })).toThrow("Unauthorized");
    expect(() => internalAuthGuard({ "x-internal-secret": "wrong!" })).toThrow("Unauthorized");
  });
});
