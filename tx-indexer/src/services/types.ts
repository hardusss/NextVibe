export type NativeTransfer = {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number;
};

export type TokenTransfer = {
  fromUserAccount: string;
  toUserAccount: string;
  fromTokenAccount: string;
  toTokenAccount: string;
  tokenAmount: number;
  mint: string;
};

export type AccountData = {
  account: string;
  nativeBalanceChange: number;
  tokenBalanceChanges: any[];
};

export type EnhancedTransaction = {
  signature: string;
  timestamp: number;
  slot: number;
  fee: number;
  feePayer: string;
  type: string;        // "TRANSFER" | "SWAP" | "NFT_SALE" | "UNKNOWN" | ...
  source: string;      // "SYSTEM_PROGRAM" | "JUPITER" | ...
  description: string;
  nativeTransfers: NativeTransfer[];
  tokenTransfers: TokenTransfer[];
  accountData: AccountData[];
  transactionError: string | null;
};
