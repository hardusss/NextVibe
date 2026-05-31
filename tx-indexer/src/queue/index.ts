import { Queue } from "bullmq";
import { redisConnection } from "../db/connection";
import { TX_QUEUE_NAME, type TxJob } from "./types";

export const txQueue = new Queue<TxJob>(TX_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export async function enqueueFetchInitial(
  address: string,
  limit?: number
): Promise<void> {
  await txQueue.add("fetch-initial" as const, {
    type: "fetch-initial",
    address,
    limit,
  });
}

export async function enqueueFetchMore(
  address: string,
  before: string,
  limit?: number
): Promise<void> {
  await txQueue.add("fetch-more" as const, {
    type: "fetch-more",
    address,
    before,
    limit,
  });
}

export async function enqueueWebhookTx(
  address: string,
  rawTx: Record<string, unknown>
): Promise<void> {
  await txQueue.add("webhook-tx" as const, {
    type: "webhook-tx",
    address,
    rawTx,
  });
}
