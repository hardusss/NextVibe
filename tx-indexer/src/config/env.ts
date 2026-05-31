function requireEnv(key: string): string {
  const value = Bun.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

function buildMysqlUrl(): string {
  if (Bun.env.MYSQL_URL?.trim()) {
    return Bun.env.MYSQL_URL.trim();
  }

  const host = requireEnv("MYSQL_HOST");
  const port = Bun.env.MYSQL_PORT?.trim() ?? "3306";
  const user = requireEnv("MYSQL_USER");
  const password = requireEnv("MYSQL_PASSWORD");
  const database = requireEnv("MYSQL_DATABASE");

  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function buildRedisUrl(): string {
  if (Bun.env.REDIS_URL?.trim()) {
    return Bun.env.REDIS_URL.trim();
  }

  const host = Bun.env.REDIS_HOST?.trim() ?? "localhost";
  const port = Bun.env.REDIS_PORT?.trim() ?? "6379";
  return `redis://${host}:${port}`;
}

export const env = {
  PORT: parsePort(Bun.env.PORT ?? "3000"),
  NODE_ENV: Bun.env.NODE_ENV ?? "development",
  MYSQL_URL: buildMysqlUrl(),
  REDIS_URL: buildRedisUrl(),
  HELIUS_API_KEY: requireEnv("HELIUS_API_KEY"),
  HELIUS_WEBHOOK_ID: requireEnv("HELIUS_WEBHOOK_ID"),
  HELIUS_WEBHOOK_SECRET: requireEnv("HELIUS_WEBHOOK_SECRET"),
  HELIUS_WEBHOOK_URL: requireEnv("HELIUS_WEBHOOK_URL"),
  INTERNAL_SECRET: requireEnv("INTERNAL_SECRET"),
  INITIAL_FETCH_LIMIT: Number(Bun.env.INITIAL_FETCH_LIMIT ?? "10"),
  LOAD_MORE_DEFAULT_LIMIT: Number(Bun.env.LOAD_MORE_DEFAULT_LIMIT ?? "50"),
  USERS_TABLE: Bun.env.USERS_TABLE?.trim() ?? "user_user",
  MYSQL_SSL: Bun.env.MYSQL_SSL === "true",
  HELIUS_WEBHOOK_ADDRESS_LIMIT: Number(Bun.env.HELIUS_WEBHOOK_ADDRESS_LIMIT ?? "500"),
} as const;
