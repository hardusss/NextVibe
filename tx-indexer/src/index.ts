import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { env } from "./config/env";
import { closeConnections, pingMysql, pingRedis } from "./db/connection";
import { indexRoutes } from "./routes/index.route";
import { historyRoutes } from "./routes/history.route";
import { webhookRoutes } from "./routes/webhook.route";
import { refreshRoutes } from "./routes/refresh.route";
import { startWorker } from "./queue/worker";
import { runInitialSync } from "./cron/initial-sync";
import type { Worker } from "bullmq";
import type { TxJob } from "./queue/types";

let worker: Worker<TxJob> | null = null;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[server] received ${signal}, shutting down...`);

  if (worker) {
    await worker.close();
  }

  await closeConnections();
  process.exit(0);
}

function registerShutdownHandlers(): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      shutdown(signal).catch((error) => {
        console.error("[server] shutdown error:", error);
        process.exit(1);
      });
    });
  }
}

async function bootstrap(): Promise<void> {
  registerShutdownHandlers();
  worker = startWorker();

  const app = new Elysia()
    .use(
      swagger({
        documentation: {
          info: {
            title: "NextVibe TX Indexer",
            version: "1.0.0",
          },
        },
      })
    )
    .get("/health", async ({ set }) => {
      const [mysqlOk, redisOk] = await Promise.all([pingMysql(), pingRedis()]);

      const healthy = mysqlOk && redisOk;
      if (!healthy) {
        set.status = 503;
      }

      return {
        status: healthy ? "ok" : "degraded",
        mysql: mysqlOk,
        redis: redisOk,
        uptime: process.uptime(),
      };
    })
    .get("/", () => ({
      service: "nextvibe-tx-indexer",
      health: "/health",
      docs: "/swagger",
    }))
    .onError(({ code, error, set }) => {
      if (code === "NOT_FOUND") {
        set.status = 404;
        return { error: "Not found" };
      }

      console.error("[server] unhandled error:", error);
      set.status = 500;
      return { error: "Internal server error" };
    })
    .use(indexRoutes)
    .use(historyRoutes)
    .use(webhookRoutes)
    .use(refreshRoutes)
    .listen(env.PORT);

  console.log(
    `[server] tx-indexer listening on http://${app.server?.hostname}:${app.server?.port}`
  );

  runInitialSync().catch((error) => {
    console.error("[initial-sync] failed:", error);
  });
}

bootstrap().catch((error) => {
  console.error("[server] bootstrap failed:", error);
  process.exit(1);
});
