import { Worker, type Job } from "bullmq";
import { redisConnection } from "../db/connection";
import {
  insertTransactions,
  mapEnhancedTransaction,
  markSyncCursorDone,
  setSyncCursorStatus,
  upsertSyncCursor,
} from "../db/queries";
import { env } from "../config/env";
import { getEnhancedTransactions } from "../services/helius";
import type { EnhancedTransaction } from "../services/types";
import { TX_QUEUE_NAME, type FetchInitialJob, type FetchMoreJob, type TxJob, type WebhookTxJob } from "./types";

async function handleFetchInitial(data: FetchInitialJob): Promise<number> {
  const limit = data.limit ?? env.INITIAL_FETCH_LIMIT;
  const { address } = data;

  await setSyncCursorStatus(address, "syncing");

  try {
    const txs = await getEnhancedTransactions(address, limit);
    const rows = txs.map((tx) => mapEnhancedTransaction(address, tx, "fetch"));
    const inserted = await insertTransactions(rows);

    const oldestSignature =
      txs.length > 0 ? txs[txs.length - 1]?.signature ?? null : null;

    await upsertSyncCursor(address, oldestSignature, txs.length);

    if (txs.length === 0) {
      await markSyncCursorDone(address);
    }

    return inserted;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await setSyncCursorStatus(address, "error", message.slice(0, 512));
    throw error;
  }
}

async function handleFetchMore(data: FetchMoreJob): Promise<number> {
  const limit = data.limit ?? env.LOAD_MORE_DEFAULT_LIMIT;
  const { address, before } = data;

  await setSyncCursorStatus(address, "syncing");

  try {
    const txs = await getEnhancedTransactions(address, limit, before);
    const rows = txs.map((tx) => mapEnhancedTransaction(address, tx, "fetch"));
    const inserted = await insertTransactions(rows);

    if (txs.length === 0) {
      await markSyncCursorDone(address);
      return 0;
    }

    const oldestSignature = txs[txs.length - 1]?.signature ?? null;
    await upsertSyncCursor(address, oldestSignature, txs.length);

    if (txs.length < limit) {
      await markSyncCursorDone(address);
    }

    return inserted;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await setSyncCursorStatus(address, "error", message.slice(0, 512));
    throw error;
  }
}

async function handleWebhookTx(data: WebhookTxJob): Promise<number> {
  const tx = data.rawTx as unknown as EnhancedTransaction;
  const row = mapEnhancedTransaction(data.address, tx, "webhook");
  const inserted = await insertTransactions([row]);
  return inserted;
}

async function processJob(job: Job<TxJob>): Promise<void> {
  switch (job.data.type) {
    case "fetch-initial": {
      const inserted = await handleFetchInitial(job.data);
      console.log(`[worker] fetch-initial ${job.data.address}: inserted ${inserted}`);
      return;
    }
    case "fetch-more": {
      const inserted = await handleFetchMore(job.data);
      console.log(`[worker] fetch-more ${job.data.address}: inserted ${inserted}`);
      return;
    }
    case "webhook-tx": {
      const inserted = await handleWebhookTx(job.data);
      console.log(`[worker] webhook-tx ${job.data.address}: inserted ${inserted}`);
      return;
    }
    default: {
      const _exhaustive: never = job.data;
      throw new Error(`Unknown job type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function startWorker(): Worker<TxJob> {
  const worker = new Worker<TxJob>(TX_QUEUE_NAME, processJob, {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: 8,
      duration: 1000,
    },
  });

  worker.on("failed", (job, error) => {
    console.error(`[worker] job ${job?.id} failed:`, error.message);
  });

  worker.on("completed", (job) => {
    console.log(`[worker] job ${job.id} completed`);
  });

  return worker;
}
