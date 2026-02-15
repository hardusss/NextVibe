import axios from "axios";
import GetApiUrl from "../utils/url_api";

interface TokensPriceResponse {
    /** Map of token IDs to their current prices (e.g., { solana: 145.5 }) */
    prices: Record<string, number>;
    message: string;
}

/**
 * Batch fetches current market prices for specified tokens via the backend API.
 * Implements silent failure (returns null) to ensure UI resilience during network issues.
 *
 * @param tokens - Array of token identifiers (e.g., ["solana", "usd-coin"]).
 * @param currency - Target fiat currency for conversion (default: "usd").
 * @returns The price data object or null if the request fails.
 */
export default async function getTokensPrice(
    tokens: string[],
    currency: string = "usd"
): Promise<TokensPriceResponse | null> {
    try {
        const response = await axios.post<TokensPriceResponse>(
            `${GetApiUrl()}/wallets/get-tokens-price/`,
            { tokens, currency }
        );

        return response.data;
    } catch (error: any) {
        // Log specifics for debugging but prevent app crash
        console.error("API Error (getTokensPrice):", error.response?.data || error.message);
        return null;
    }
}