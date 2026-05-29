import type {
    JupiterQuoteParams,
    JupiterQuoteResponse,
    JupiterSwapParams,
    JupiterSwapResponse,
} from '@/src/types/jupiter';

/**
 * Base URL for the Jupiter Swap API.
 *
 * Uses the **free** `lite-api.jup.ag` endpoint which does not require an API key.
 * For higher rate limits, replace with `https://api.jup.ag` and add an
 * `x-api-key` header (obtainable from https://portal.jup.ag).
 */
const API_KEY = process.env.EXPO_PUBLIC_JUPITER_API_KEY;
const JUPITER_BASE_URL = API_KEY ? 'https://api.jup.ag/swap/v1' : 'https://lite-api.jup.ag/swap/v1';

const getHeaders = () => {
    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    if (API_KEY) {
        headers['x-api-key'] = API_KEY;
    }
    return headers;
};

/**
 * JupiterService
 *
 * Stateless service class that wraps the Jupiter Swap API v1.
 * Provides typed methods for fetching swap quotes and building
 * serialized transactions ready for wallet signing.
 *
 * @example
 * ```ts
 * // 1. Get a quote
 * const quote = await JupiterService.getQuote({
 *     inputMint: SOL_MINT_ADDRESS,
 *     outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
 *     amount: '1000000000', // 1 SOL
 *     slippageBps: 50,
 * });
 *
 * // 2. Build the swap transaction
 * const { swapTransaction } = await JupiterService.getSwapTransaction({
 *     quoteResponse: quote,
 *     userPublicKey: wallet.publicKey.toBase58(),
 * });
 *
 * // 3. Deserialize, sign, and send via your wallet adapter
 * ```
 */
export default class JupiterService {

    /**
     * Fetches an optimal swap quote from Jupiter.
     *
     * Queries all available liquidity sources (Raydium, Orca, Meteora, etc.)
     * and returns the route with the best output amount.
     *
     * @param params - Quote request parameters (mints, amount, slippage)
     * @returns The best quote found, including route plan and price impact
     * @throws {Error} If the API returns a non-OK status or network error occurs
     *
     * @example
     * ```ts
     * const quote = await JupiterService.getQuote({
     *     inputMint: 'So11111111111111111111111111111111111111112',
     *     outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
     *     amount: '500000000', // 0.5 SOL
     *     slippageBps: 100,    // 1%
     * });
     * console.log(`Output: ${quote.outAmount}`);
     * ```
     */
    static async getQuote(params: JupiterQuoteParams): Promise<JupiterQuoteResponse> {
        const query = new URLSearchParams({
            inputMint: params.inputMint,
            outputMint: params.outputMint,
            amount: params.amount,
            slippageBps: String(params.slippageBps ?? 50),
            swapMode: params.swapMode ?? 'ExactIn',
        });

        const url = `${JUPITER_BASE_URL}/quote?${query.toString()}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: getHeaders(),
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(
                `[JupiterService] Quote request failed (${response.status}): ${body}`
            );
        }

        return response.json();
    }

    /**
     * Builds a serialized swap transaction from a previously fetched quote.
     *
     * The returned `swapTransaction` is a **base64-encoded** `VersionedTransaction`
     * that must be deserialized, signed by the user's wallet, and sent to the network.
     *
     * @param params - Swap parameters including the full quote and user's public key
     * @returns Serialized transaction and metadata (block height, fees)
     * @throws {Error} If the API returns a non-OK status or the quote has expired
     *
     * @example
     * ```ts
     * const { swapTransaction, lastValidBlockHeight } =
     *     await JupiterService.getSwapTransaction({
     *         quoteResponse: quote,
     *         userPublicKey: 'YourWalletPublicKeyBase58...',
     *         wrapAndUnwrapSol: true,
     *     });
     * ```
     */
    static async getSwapTransaction(params: JupiterSwapParams): Promise<JupiterSwapResponse> {
        const body: Record<string, unknown> = {
            quoteResponse: params.quoteResponse,
            userPublicKey: params.userPublicKey,
            wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
            dynamicComputeUnitLimit: params.dynamicComputeUnitLimit ?? true,
            prioritizationFeeLamports: params.prioritizationFeeLamports ?? 'auto',
        };

        if (params.dynamicSlippage) {
            body.dynamicSlippage = params.dynamicSlippage;
        }

        if (params.asLegacyTransaction !== undefined) {
            body.asLegacyTransaction = params.asLegacyTransaction;
        }

        const response = await fetch(`${JUPITER_BASE_URL}/swap`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            throw new Error(
                `[JupiterService] Swap transaction request failed (${response.status}): ${errorBody}`
            );
        }

        return response.json();
    }
}
