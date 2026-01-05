import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@lazorkit/wallet-mobile-adapter"; 
import SolanaService from "@/src/services/SolanaService"; 

/**
 * Represents a single token asset in the user's portfolio
 * @interface TokenAsset
 */
export interface TokenAsset {
    /** Token symbol (e.g., "SOL", "USDC") */
    symbol: string;
    
    /** Full token name (e.g., "Solana", "USD Coin") */
    name: string;
    
    /** Amount of tokens held (in native token units) */
    amount: number;
    
    /** Current price per token in USD */
    price: number;
    
    /** Total value of holdings in USD (amount × price) */
    valueUsd: number;
    
    /** Optional URL to token logo image */
    logoURI?: string;
}

/**
 * Complete portfolio data structure
 * @interface PortfolioData
 */
export interface PortfolioData {
    /** Sum of all token holdings valued in USD */
    totalUsdBalance: number;
    
    /** Array of individual token holdings */
    tokens: TokenAsset[];
}

/**
 * Return type for the usePortfolio hook
 * @interface UsePortfolioReturn
 */
export interface UsePortfolioReturn {
    /** Current portfolio data (tokens and total balance) */
    data: PortfolioData;
    
    /** Loading state indicator for initial fetch and refreshes */
    isLoading: boolean;
    
    /** Function to manually trigger portfolio data refresh */
    refresh: () => Promise<void>;
}

/**
 * usePortfolio Hook
 * 
 * Custom React hook for fetching and managing Solana wallet portfolio data.
 * Automatically loads portfolio when wallet connects and provides manual refresh capability.
 * 
 * Current Implementation:
 * - Fetches SOL and USDC balances from the connected smart wallet
 * - Uses hardcoded price data (should be replaced with live price API)
 * - Automatically refetches when wallet address changes
 * - Provides manual refresh function for pull-to-refresh scenarios
 * 
 * Data Flow:
 * 1. Hook initializes with loading state
 * 2. Waits for smartWalletPubkey from useWallet
 * 3. Fetches SOL and USDC balances in parallel
 * 4. Calculates USD values using price data
 * 5. Updates state with formatted portfolio data
 * 
 * Future Improvements:
 * - Replace hardcoded prices with live price feed (CoinGecko, Jupiter, etc.)
 * - Support additional SPL tokens beyond SOL and USDC
 * - Add caching layer to reduce unnecessary API calls
 * - Implement error state and retry logic
 * - Add support for NFT holdings
 * 
 * @example
 * ```tsx
 * function WalletScreen() {
 *   const { data, isLoading, refresh } = usePortfolio();
 * 
 *   if (isLoading) return <LoadingSpinner />;
 * 
 *   return (
 *     <ScrollView onRefresh={refresh}>
 *       <Text>Total Balance: ${data.totalUsdBalance.toFixed(2)}</Text>
 *       {data.tokens.map(token => (
 *         <TokenRow key={token.symbol} token={token} />
 *       ))}
 *     </ScrollView>
 *   );
 * }
 * ```
 * 
 * @returns {UsePortfolioReturn} Portfolio data, loading state, and refresh function
 */
export default function usePortfolio(): UsePortfolioReturn {
    /** 
     * Smart wallet public key and RPC connection from LazorKit adapter
     * smartWalletPubkey: The user's Solana wallet address
     * connection: RPC connection instance for blockchain queries
     */
    const { smartWalletPubkey, connection } = useWallet(); 

    
    /** Loading state - true during initial fetch and manual refreshes */
    const [isLoading, setIsLoading] = useState(true);
    
    /** 
     * Portfolio data state
     * Initialized with empty portfolio (zero balance, no tokens)
     */
    const [data, setData] = useState<PortfolioData>({
        totalUsdBalance: 0,
        tokens: []
    });
    
    /**
     * Core data fetching function
     * 
     * Fetches SOL and USDC balances, calculates USD values, and updates state.
     * Runs in parallel for better performance using Promise.all.
     * 
     * Process:
     * 1. Validates wallet address and connection exist
     * 2. Fetches SOL and USDC balances concurrently
     * 3. Applies price data to calculate USD values
     * 4. Filters out zero-balance tokens
     * 5. Calculates total portfolio value
     * 6. Updates state with formatted data
     * 
     * Error Handling:
     * - Logs errors to console but doesn't crash
     * - Returns early if wallet/connection unavailable
     * - Always sets loading to false in finally block
     * 
     * @async
     * @private
     */
    const fetchData = async () => {
        // Convert PublicKey to string, early return if not available
        const addressString = smartWalletPubkey?.toString();
        if (!addressString || !connection) return;

        try {
            console.log("Fetching for:", addressString);
            setIsLoading(true);

            /**
             * Parallel balance fetching for better performance
             * - getSolBalance: Native SOL balance from wallet
             * - getUsdcBalance: USDC token balance (SPL token account)
             */
            const [solAmount, usdcAmount] = await Promise.all([
                SolanaService.getSolBalance(connection, addressString),
                SolanaService.getUsdcBalance(connection, addressString)
            ]);

            /**
             * Price data (currently hardcoded)
             * 
             * TODO: Replace with live price API integration
             * Recommended APIs:
             * - CoinGecko: Free tier available, good for USD prices
             * - Jupiter Price API: Native Solana prices, fast updates
             * - Pyth Network: Real-time oracle prices on-chain
             */
            const prices = { SOL: 145.50, USDC: 1.00 };

            // Array to accumulate non-zero token holdings
            const assets: TokenAsset[] = [];
            
            // Running total of portfolio value in USD
            let total = 0;

            /**
             * Process SOL balance
             * Only include if balance > 0 to avoid cluttering UI
             */
            if (solAmount > 0) {
                const val = solAmount * prices.SOL;
                total += val;
                assets.push({
                    symbol: 'SOL',
                    name: 'Solana',
                    amount: solAmount,
                    price: prices.SOL,
                    valueUsd: val,
                    // Official Solana token logo from token-list repository
                    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
                });
            }

            /**
             * Process USDC balance
             * Only include if balance > 0
             */
            if (usdcAmount > 0) {
                const val = usdcAmount * prices.USDC;
                total += val;
                assets.push({
                    symbol: 'USDC',
                    name: 'USD Coin',
                    amount: usdcAmount,
                    price: prices.USDC,
                    valueUsd: val,
                    // USDC logo from cryptologos CDN
                    logoURI: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=040'
                });
            }

            /**
             * Update state with computed portfolio data
             * This triggers re-render in consuming components
             */
            setData({
                totalUsdBalance: total,
                tokens: assets
            });

        } catch (e) {
            /**
             * Error handling
             * 
             * Potential errors:
             * - Network timeout (RPC connection issues)
             * - Invalid wallet address
             * - RPC rate limiting
             * - Malformed response from SolanaService
             * 
             * TODO: Implement proper error state and user notification
             */
            console.error(e);
        } finally {
            /**
             * Always reset loading state
             * Ensures UI doesn't get stuck in loading state on error
             */
            setIsLoading(false);
        }
    };
    
    /**
     * Auto-fetch effect
     * 
     * Triggers portfolio fetch whenever the wallet address changes.
     * This handles scenarios like:
     * - Initial wallet connection
     * - Switching between multiple wallets
     * - Wallet reconnection after app restart
     * 
     * Dependency: smartWalletPubkey?.toString()
     * - Using toString() ensures we track the actual address value
     * - Optional chaining (?.) prevents errors when wallet disconnects
     */
    useEffect(() => {
        fetchData();
    }, [smartWalletPubkey?.toString()]);
    
    /**
     * Manual refresh function
     * 
     * Memoized with useCallback to prevent unnecessary re-renders in parent components.
     * Useful for pull-to-refresh functionality in UI.
     * 
     * Dependencies: [smartWalletPubkey, connection]
     * - Recreates function only when wallet/connection changes
     * - Ensures refresh always uses latest wallet context
     * 
     * @async
     * @public
     * @example
     * ```tsx
     * <ScrollView
     *   refreshControl={
     *     <RefreshControl refreshing={isLoading} onRefresh={refresh} />
     *   }
     * />
     * ```
     */
    const refresh = useCallback(async () => {
        await fetchData();
    }, [smartWalletPubkey, connection]);

    // Return hook interface
    return { data, isLoading, refresh };
}