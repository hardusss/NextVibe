/**
 * Represents the input and output sides of a token swap transaction.
 * Contains all data needed to render a rich swap visualization with icons,
 * amounts, and token symbols for both the sold and bought tokens.
 *
 * @interface SwapDetails
 */
export interface SwapDetails {
    /** Symbol of the token that was sold (e.g., "USDC") */
    inputToken: string;

    /** Human-readable amount of the token that was sold */
    inputAmount: number;

    /** Logo URL of the sold token (resolved from TOKENS constant or null) */
    inputLogoURL: string | null;

    /** Symbol of the token that was received (e.g., "SOL") */
    outputToken: string;

    /** Human-readable amount of the token that was received */
    outputAmount: number;

    /** Logo URL of the received token (resolved from TOKENS constant or null) */
    outputLogoURL: string | null;
}

/**
 * Compressed-NFT details attached to a transaction when the wallet
 * claimed, received, sent, or burned a cNFT (Bubblegum leaf change).
 *
 * @interface NftDetails
 */
export interface NftDetails {
    /** DAS asset id (leaf asset PDA) */
    assetId: string;

    /** Display name from on-chain metadata (null when the event carries none) */
    name: string | null;

    /** Off-chain metadata URI (null when the event carries none) */
    uri: string | null;

    /** What happened to the cNFT from this wallet's perspective */
    kind: "claimed" | "received" | "sent" | "burned";

    /** Decoded SPL Memo attached to the transaction, if any */
    memo: string | null;
}

/**
 * Formatted transaction object for display in UI.
 * Represents a single SOL or SPL token transfer with human-readable data.
 * For swap transactions, includes detailed input/output token information.
 *
 * @interface FormattedTransaction
 */
export type FormattedTransaction = {
    /** Transaction signature (unique identifier on Solana blockchain) */
    signature: string;

    /** Direction of transaction relative to current wallet */
    type: "sent" | "received" | "swap";

    /** Token identifier — "SOL" for native SOL or mint address for SPL tokens */
    token: string;

    /** Transaction amount in token's base units (e.g., SOL, not lamports) */
    amount: number;

    /** Sender wallet address */
    from: string;

    /** Recipient wallet address */
    to: string;

    /** Transaction timestamp (null if block time unavailable) */
    time: Date | null;

    /** Detailed swap information (only present when type === "swap") */
    swapDetails?: SwapDetails;

    /** Compressed-NFT details (only present when token === "cNFT") */
    nft?: NftDetails;

    /** Network fee in SOL paid by this wallet (0 when someone else paid) */
    fee?: number;
};
