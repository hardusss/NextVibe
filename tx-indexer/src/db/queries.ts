import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "./connection";
import { env } from "../config/env";
import type { EnhancedTransaction } from "../services/types";

export type TxSource = "fetch" | "webhook";
export type TxStatus = "success" | "failed";
export type CursorStatus = "idle" | "syncing" | "error" | "done";

export type SyncCursor = {
  address: string;
  last_signature: string | null;
  total_fetched: number;
  status: CursorStatus;
  error_message: string | null;
};

type InsertTxRow = {
  signature: string;
  address: string;
  slot: number | null;
  blockTime: Date | null;
  fee: number | null;
  status: TxStatus;
  rawData: unknown;
  source: TxSource;
};

function toMysqlDatetime(unixSeconds: number | null | undefined): Date | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000);
}

export function mapEnhancedTransaction(
  address: string,
  tx: EnhancedTransaction,
  source: TxSource
): InsertTxRow {
  return {
    signature: tx.signature,
    address,
    slot: tx.slot ?? null,
    blockTime: toMysqlDatetime(tx.timestamp),
    fee: tx.fee ?? null,
    status: tx.transactionError ? "failed" : "success",
    rawData: tx,
    source,
  };
}

export async function getWalletAddresses(): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT wallet_address
     FROM ${env.USERS_TABLE}
     WHERE wallet_address IS NOT NULL
       AND wallet_address != ''`
  );

  return rows.map((row) => String(row.wallet_address));
}

export async function countTransactionsByAddress(address: string): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM transactions WHERE address = ?",
    [address]
  );

  return Number(rows[0]?.count ?? 0);
}

export async function findMonitoredWalletForTx(
  tx: EnhancedTransaction
): Promise<string | null> {
  const candidates = collectTxAddresses(tx);
  if (candidates.length === 0) return null;

  const placeholders = candidates.map(() => "?").join(",");
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT wallet_address
     FROM ${env.USERS_TABLE}
     WHERE wallet_address IN (${placeholders})`,
    candidates
  );

  if (rows.length === 0) return null;

  const monitored = new Set(rows.map((row) => String(row.wallet_address)));
  const accountData = tx.accountData ?? [];

  for (const account of accountData) {
    const wallet = account?.account?.trim();
    if (wallet && monitored.has(wallet) && account.nativeBalanceChange !== 0) {
      return wallet;
    }
  }

  for (const account of accountData) {
    const wallet = account?.account?.trim();
    if (wallet && monitored.has(wallet)) {
      return wallet;
    }
  }

  const feePayer = tx.feePayer?.trim();
  if (feePayer && monitored.has(feePayer)) {
    return feePayer;
  }

  return String(rows[0]?.wallet_address ?? "") || null;
}

function collectTxAddresses(tx: EnhancedTransaction): string[] {
  const set = new Set<string>();

  const feePayer = tx.feePayer?.trim();
  if (feePayer) set.add(feePayer);

  for (const account of tx.accountData ?? []) {
    const wallet = account?.account?.trim();
    if (wallet) set.add(wallet);
  }

  for (const transfer of tx.nativeTransfers ?? []) {
    const from = transfer?.fromUserAccount?.trim();
    const to = transfer?.toUserAccount?.trim();
    if (from) set.add(from);
    if (to) set.add(to);
  }

  return [...set];
}

export async function countAllTransactions(): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM transactions"
  );

  return Number(rows[0]?.count ?? 0);
}

export async function insertTransaction(row: InsertTxRow): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT IGNORE INTO transactions
      (signature, address, slot, block_time, fee, status, raw_data, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.signature,
      row.address,
      row.slot,
      row.blockTime,
      row.fee,
      row.status,
      JSON.stringify(row.rawData),
      row.source,
    ]
  );

  return result.affectedRows > 0;
}

export async function insertTransactions(
  rows: InsertTxRow[]
): Promise<number> {
  if (rows.length === 0) return 0;

  let inserted = 0;
  for (const row of rows) {
    if (await insertTransaction(row)) {
      inserted += 1;
    }
  }
  return inserted;
}

export async function getSyncCursor(address: string): Promise<SyncCursor | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT address, last_signature, total_fetched, status, error_message
     FROM sync_cursors
     WHERE address = ?`,
    [address]
  );

  if (!rows[0]) return null;

  return {
    address: String(rows[0].address),
    last_signature: rows[0].last_signature ? String(rows[0].last_signature) : null,
    total_fetched: Number(rows[0].total_fetched ?? 0),
    status: rows[0].status as CursorStatus,
    error_message: rows[0].error_message ? String(rows[0].error_message) : null,
  };
}

export async function upsertSyncCursor(
  address: string,
  lastSignature: string | null,
  fetchedCount: number
): Promise<void> {
  await pool.query(
    `INSERT INTO sync_cursors (address, last_signature, total_fetched, status)
     VALUES (?, ?, ?, 'idle')
     ON DUPLICATE KEY UPDATE
       last_signature = VALUES(last_signature),
       total_fetched = total_fetched + VALUES(total_fetched),
       status = 'idle',
       error_message = NULL,
       updated_at = NOW()`,
    [address, lastSignature, fetchedCount]
  );
}

export async function setSyncCursorStatus(
  address: string,
  status: CursorStatus,
  errorMessage: string | null = null
): Promise<void> {
  await pool.query(
    `INSERT INTO sync_cursors (address, status, error_message)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       error_message = VALUES(error_message),
       updated_at = NOW()`,
    [address, status, errorMessage]
  );
}

export async function markSyncCursorDone(address: string): Promise<void> {
  await setSyncCursorStatus(address, "done");
}
