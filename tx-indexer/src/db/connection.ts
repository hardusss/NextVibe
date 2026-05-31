import mysql from "mysql2/promise";
import Redis from "ioredis";
import { env } from "../config/env";

export const pool = mysql.createPool({
  uri: env.MYSQL_URL,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  ...(env.MYSQL_SSL ? { ssl: { rejectUnauthorized: false } } : {}),
});

function parseRedisUrl(url: string): {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db?: number;
} {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined,
  };
}

export const redisConnection = {
  ...parseRedisUrl(env.REDIS_URL),
  maxRetriesPerRequest: null as null,
};

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
});

export async function pingMysql(): Promise<boolean> {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

export async function pingRedis(): Promise<boolean> {
  const result = await redis.ping();
  return result === "PONG";
}

export async function closeConnections(): Promise<void> {
  await Promise.allSettled([pool.end(), redis.quit()]);
}
