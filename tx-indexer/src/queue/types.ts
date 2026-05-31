export type FetchInitialJob = {
  type: "fetch-initial";
  address: string;
  limit?: number;
};

export type FetchMoreJob = {
  type: "fetch-more";
  address: string;
  before: string;
  limit?: number;
};

export type WebhookTxJob = {
  type: "webhook-tx";
  address: string;
  rawTx: Record<string, unknown>;
};

export type TxJob = FetchInitialJob | FetchMoreJob | WebhookTxJob;

export const TX_QUEUE_NAME = "tx-fetch";
