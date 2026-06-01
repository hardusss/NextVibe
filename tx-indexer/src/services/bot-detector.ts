import { redis } from "../db/connection";

const MAX_TX_PER_HOUR = 50;
const ONE_HOUR_SECONDS = 3600;
const BLACKLIST_DURATION_SECONDS = 48 * 3600; // 48 hours

/**
 * Checks if a wallet is blacklisted, or if not, increments its counter.
 * If the counter exceeds the limit, it blacklists the wallet for 48 hours.
 * @returns true if the wallet is a bot (blacklisted), false otherwise.
 */
export async function checkAndRateLimitWallet(address: string): Promise<boolean> {
  const blacklistKey = `blacklist:bot:${address}`;
  const counterKey = `tx_count_1h:${address}`;

  // 1. Check if already blacklisted
  const isBlacklisted = await redis.exists(blacklistKey);
  if (isBlacklisted) {
    return true;
  }

  // 2. Increment transaction counter for the hour
  const countStr = await redis.get(counterKey);
  const count = countStr ? parseInt(countStr, 10) : 0;

  if (count >= MAX_TX_PER_HOUR) {
    // 3. Limit exceeded: add to blacklist for 48 hours
    await redis.set(blacklistKey, "true", "EX", BLACKLIST_DURATION_SECONDS);
    console.warn(`[bot-detector] Wallet ${address} exceeded ${MAX_TX_PER_HOUR} tx/hr. Blacklisted for 48h.`);
    return true;
  }

  // 4. Update counter
  const multi = redis.multi();
  multi.incr(counterKey);
  if (count === 0) {
    // Set expiry on the first increment
    multi.expire(counterKey, ONE_HOUR_SECONDS);
  }
  await multi.exec();

  return false;
}
