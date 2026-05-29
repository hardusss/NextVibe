/**
 * Jupiter Swap API v1 — Type Definitions
 *
 * Covers the full request/response surface for the Jupiter quote and swap endpoints.
 * All monetary amounts are expressed as **raw integer strings** (before decimal adjustment).
 *
 * @see https://dev.jup.ag — Official Jupiter developer documentation
 */

// ═══════════════════════════════════════════
// Quote
// ═══════════════════════════════════════════

/**
 * Parameters for the `GET /swap/v1/quote` endpoint.
 *
 * @example
 * ```ts
 * const params: JupiterQuoteParams = {
 *   inputMint: 'So11111111111111111111111111111111111111112',
 *   outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
 *   amount: '1000000000', // 1 SOL in lamports
 *   slippageBps: 50,       // 0.5 %
 * };
 * ```
 */
export interface JupiterQuoteParams {
    /** Mint address of the token being sold. Use `SOL_MINT_ADDRESS` for native SOL. */
    inputMint: string;

    /** Mint address of the token being bought. */
    outputMint: string;

    /** Amount to swap in **raw atomic units** (e.g. lamports for SOL). */
    amount: string;

    /** Slippage tolerance in basis points (1 bp = 0.01 %). Default: 50 (0.5 %). */
    slippageBps?: number;

    /** Swap direction. Default: `'ExactIn'`. */
    swapMode?: 'ExactIn' | 'ExactOut';
}

/**
 * A single hop in the swap route returned by the quote endpoint.
 */
export interface JupiterRoutePlanStep {
    /** The AMM / DEX that handles this hop (e.g. "Raydium CLMM"). */
    swapInfo: {
        ammKey: string;
        label: string;
        inputMint: string;
        outputMint: string;
        inAmount: string;
        outAmount: string;
        feeAmount: string;
        feeMint: string;
    };
    /** Percentage of the input amount routed through this hop (0–100). */
    percent: number;
}

/**
 * Full response from `GET /swap/v1/quote`.
 *
 * Contains the optimal route, amounts, and impact analysis for a proposed swap.
 */
export interface JupiterQuoteResponse {
    /** Mint address of the input token. */
    inputMint: string;

    /** Raw input amount (atomic units). */
    inAmount: string;

    /** Mint address of the output token. */
    outputMint: string;

    /** Raw output amount (atomic units) — the best offer found across all routes. */
    outAmount: string;

    /**
     * Minimum output amount the user will accept (after slippage).
     * If the on-chain execution yields less than this, the transaction reverts.
     */
    otherAmountThreshold: string;

    /** `'ExactIn'` or `'ExactOut'`. Mirrors the request. */
    swapMode: string;

    /** Slippage tolerance echoed back in basis points. */
    slippageBps: number;

    /**
     * Price impact as a decimal string (e.g. `"0.12"` means 0.12 %).
     * A high value warns the user about significant market impact.
     */
    priceImpactPct: string;

    /** Ordered list of hops in the optimal route. */
    routePlan: JupiterRoutePlanStep[];

    /** Estimated platform/network fees in lamports. */
    platformFee?: {
        amount: string;
        feeBps: number;
    } | null;
}

// ═══════════════════════════════════════════
// Swap Transaction
// ═══════════════════════════════════════════

/**
 * Parameters for the `POST /swap/v1/swap` endpoint.
 */
export interface JupiterSwapParams {
    /** The full quote object returned by `getQuote`. */
    quoteResponse: JupiterQuoteResponse;

    /** The user's wallet public key (base58). */
    userPublicKey: string;

    /**
     * When `true`, Jupiter wraps/unwraps SOL automatically.
     * This should be `true` for most user-facing swaps.
     */
    wrapAndUnwrapSol?: boolean;

    /** Priority fee level. Helps with confirmation speed during congestion. */
    prioritizationFeeLamports?: number | 'auto';

    /**
     * When `true`, the API returns the transaction as individual instructions
     * instead of a pre-built serialized transaction.
     */
    asLegacyTransaction?: boolean;

    /** Dynamic compute unit limit to optimize CU usage. */
    dynamicComputeUnitLimit?: boolean;

    /** Dynamic slippage configuration. */
    dynamicSlippage?: {
        maxBps: number;
    };
}

/**
 * Response from `POST /swap/v1/swap`.
 *
 * Contains a base64-encoded `VersionedTransaction` ready for signing.
 */
export interface JupiterSwapResponse {
    /** Base64-encoded serialized `VersionedTransaction`. */
    swapTransaction: string;

    /** The last valid block height for the transaction. */
    lastValidBlockHeight: number;

    /** Priority fee actually applied (in lamports). */
    prioritizationFeeLamports?: number;

    /** Compute units consumed (estimate). */
    computeUnitLimit?: number;

    /** Dynamic slippage report when `dynamicSlippage` is used. */
    dynamicSlippageReport?: {
        slippageBps: number;
        otherAmount: number;
        simulatedIncurredSlippageBps: number;
    } | null;
}
