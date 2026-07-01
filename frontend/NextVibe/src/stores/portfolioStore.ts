import { create } from 'zustand';
import { Connection, PublicKey } from '@solana/web3.js';
import SolanaService from '@/src/services/SolanaService';
import getTokensPrice from '@/src/api/get.tokens.price';
import { TOKENS } from '@/constants/Tokens';
import type { TokenAsset, PortfolioData } from '@/hooks/usePortfolio.types';

const EMPTY_PORTFOLIO: PortfolioData = {
    totalUsdBalance: 0,
    tokens: [],
};

/** Dedupe concurrent fetches for the same wallet (module-level). */
let inFlightKey: string | null = null;
let inFlightPromise: Promise<void> | null = null;

async function buildPortfolio(
    connection: Connection,
    addressString: string,
): Promise<PortfolioData> {
    const [solAmount, splBalances] = await Promise.all([
        SolanaService.getSolBalance(connection, addressString),
        SolanaService.getAllSplBalances(connection, addressString),
    ]);

    const priceKeys = Object.values(TOKENS).map(t => t.priceKey);
    const prices = await getTokensPrice(priceKeys);

    const assets: TokenAsset[] = [];
    let total = 0;

    Object.values(TOKENS).forEach((info) => {
        let amount = 0;
        if (info.symbol === 'SOL') {
            amount = solAmount;
        } else if (info.mint) {
            amount = splBalances[info.mint] || 0;
        }

        const tokenPrice = prices?.prices?.[info.priceKey];
        let price = tokenPrice?.price ?? 0;
        
        // Fallback if price API returns 0/null/undefined
        if (price === 0 || price === null || price === undefined) {
            const fallbackPrices: Record<string, number> = {
                USDG: 1.0,
                USDC: 1.0,
                USDT: 1.0,
                PYUSD: 1.0,
                SOL: 140.0,
                SKR: 0.1,
                JUP: 0.8,
                JitoSOL: 160.0,
                mSOL: 160.0,
                bSOL: 160.0,
            };
            price = fallbackPrices[info.symbol] ?? 0;
        }
        const change24h = tokenPrice?.change_24h ?? 0;
        const direction = tokenPrice?.direction ?? 'flat';
        const val = amount * price;
        total += val;

        assets.push({
            symbol: info.symbol,
            name: info.name,
            amount,
            price,
            change24h,
            direction,
            valueUsd: val,
            logoURI: info.logoURL,
            mint: info.mint,
            decimals: info.decimals,
        });
    });

    // Sort assets so that tokens with balance/value come first
    assets.sort((a, b) => {
        if (b.valueUsd !== a.valueUsd) {
            return b.valueUsd - a.valueUsd;
        }
        if (b.amount !== a.amount) {
            return b.amount - a.amount;
        }
        if (a.symbol === 'SOL') return -1;
        if (b.symbol === 'SOL') return 1;
        if (a.symbol === 'USDC') return -1;
        if (b.symbol === 'USDC') return 1;
        return a.symbol.localeCompare(b.symbol);
    });

    return { totalUsdBalance: total, tokens: assets };
}

interface PortfolioState {
    data: PortfolioData;
    isLoading: boolean;
    isRefreshing: boolean;
    walletKey: string | null;
    /** Always fetches fresh data. Safe to call from every usePortfolio mount. */
    fetchPortfolio: (connection: Connection, address: PublicKey | string) => Promise<void>;
    /** Force refetch (pull-to-refresh). */
    refresh: (connection: Connection, address: PublicKey | string) => Promise<void>;
    reset: () => void;
}

async function runFetch(
    connection: Connection,
    addressString: string,
    options: { isRefresh: boolean },
): Promise<void> {
    const { isRefresh } = options;
    const state = usePortfolioStore.getState();

    // Dedupe: if the same wallet is already being fetched, just wait for it
    if (inFlightKey === addressString && inFlightPromise) {
        return inFlightPromise;
    }

    if (isRefresh && state.data.tokens.length > 0) {
        usePortfolioStore.setState({ isRefreshing: true, walletKey: addressString });
    } else {
        usePortfolioStore.setState({ isLoading: true, isRefreshing: false, walletKey: addressString });
    }

    const promise = (async () => {
        try {
            if (__DEV__) {
                console.log('[Portfolio] fetch', addressString.slice(0, 8), isRefresh ? '(refresh)' : '');
            }
            const next = await buildPortfolio(connection, addressString);
            usePortfolioStore.setState({
                data: next,
                isLoading: false,
                isRefreshing: false,
                walletKey: addressString,
            });
        } catch (e) {
            console.error('[portfolioStore]', e);
            usePortfolioStore.setState({ isLoading: false, isRefreshing: false });
        }
    })();

    inFlightKey = addressString;
    inFlightPromise = promise;

    try {
        await promise;
    } finally {
        if (inFlightPromise === promise) {
            inFlightKey = null;
            inFlightPromise = null;
        }
    }
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
    data: EMPTY_PORTFOLIO,
    isLoading: true,
    isRefreshing: false,
    walletKey: null,

    reset: () => {
        inFlightKey = null;
        inFlightPromise = null;
        set({
            data: EMPTY_PORTFOLIO,
            isLoading: true,
            isRefreshing: false,
            walletKey: null,
        });
    },

    fetchPortfolio: async (connection, address) => {
        const addressString = typeof address === 'string' ? address : address.toString();
        if (!addressString) {
            set({ isLoading: false });
            return;
        }
        await runFetch(connection, addressString, { isRefresh: false });
    },

    refresh: async (connection, address) => {
        const addressString = typeof address === 'string' ? address : address.toString();
        if (!addressString) return;
        await runFetch(connection, addressString, { isRefresh: true });
    },
}));
