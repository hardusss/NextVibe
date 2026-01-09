import axios from "axios";
import GetApiUrl from "../utils/url_api";

interface TokensPriceResponse {
    prices: Record<string, number>;
    message: string
}
export default async function getTokensPrice(
    tokens: string[],
    currency: string = "usd"
): Promise<TokensPriceResponse | null> {
    try {
        const response = await axios.post<TokensPriceResponse>(
            `${GetApiUrl()}/wallets/get-tokens-price/`,
            { tokens, currency }
        );

        return response.data

    } catch (error: any){
        console.error("API Error (getTokensPrice):", error.response?.data || error.message);
        return null
    }

}