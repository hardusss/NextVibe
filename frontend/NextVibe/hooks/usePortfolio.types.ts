export interface TokenAsset {
    symbol: string;
    name: string;
    amount: number;
    price: number;
    change24h: number;
    direction: 'up' | 'down' | 'flat';
    valueUsd: number;
    logoURI?: string;
    mint: string | null;
    decimals: number;
}

export interface PortfolioData {
    totalUsdBalance: number;
    tokens: TokenAsset[];
}
