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

export type CompressedNftEvent = {
  type: string;        // "COMPRESSED_NFT_MINT" | "COMPRESSED_NFT_TRANSFER" | "COMPRESSED_NFT_BURN"
  assetId: string;
  treeId: string;
  leafIndex: number;
  newLeafOwner: string | null;
  oldLeafOwner: string | null;
  metadata?: { name?: string; symbol?: string; uri?: string };
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
  events?: { compressed?: CompressedNftEvent[] };
  transactionError: string | null;
};
