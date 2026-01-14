export const TOKEN_MINT_CONSTANTS = {
    // Circle
    USDC_MINT: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', 
};

export const TOKENS = {
    SOL: {
      symbol: "SOL",
      name: "Solana",
      logoURL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      priceKey: 'solana' as const,
      mint: null,
      decimals: 9
    },
    USDC: {
      symbol: "USDC",
      name: "USD Coin",
      logoURL: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=040",
      priceKey: 'usd-coin' as const,
      mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      decimals: 6
    },
}