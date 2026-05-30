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

function tokensEqual(a: TokenAsset[], b: TokenAsset[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((t, i) => {
        const o = b[i];
        return (
            t.symbol === o.symbol &&
            t.amount === o.amount &&
            t.price === o.price &&
            t.valueUsd === o.valueUsd &&
            t.change24h === o.change24h
        );
    });
}

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
        const price = tokenPrice?.price ?? 0;
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

    return { totalUsdBalance: total, tokens: assets };
}

interface PortfolioState {
    data: PortfolioData;
    isLoading: boolean;
    isRefreshing: boolean;
    lastFetchedAt: number | null;
    walletKey: string | null;
    /** Load once per wallet if needed; safe to call from every usePortfolio mount. */
    ensurePortfolio: (connection: Connection, address: PublicKey | string) => Promise<void>;
    /** Force refetch (pull-to-refresh). */
    refresh: (connection: Connection, address: PublicKey | string) => Promise<void>;
    reset: () => void;
}

async function runFetch(
    connection: Connection,
    addressString: string,
    options: { force: boolean },
): Promise<void> {
    const { force } = options;
    const state = usePortfolioStore.getState();

    if (!force) {
        const alreadyLoaded =
            state.walletKey === addressString && state.lastFetchedAt !== null;
        if (alreadyLoaded) {
            return;
        }
        if (inFlightKey === addressString && inFlightPromise) {
            return inFlightPromise;
        }
    } else if (inFlightKey === addressString && inFlightPromise) {
        return inFlightPromise;
    }

    const isInitial = state.walletKey !== addressString || state.lastFetchedAt === null;

    if (force && !isInitial) {
        usePortfolioStore.setState({ isRefreshing: true, walletKey: addressString });
    } else if (isInitial) {
        usePortfolioStore.setState({ isLoading: true, isRefreshing: false, walletKey: addressString });
    }

    const promise = (async () => {
        try {
            if (__DEV__) {
                console.log('[Portfolio] fetch', addressString.slice(0, 8), force ? '(force)' : '');
            }
            const next = await buildPortfolio(connection, addressString);
            usePortfolioStore.setState(current => {
                const sameTokens = tokensEqual(current.data.tokens, next.tokens);
                const sameTotal = current.data.totalUsdBalance === next.totalUsdBalance;
                return {
                    data: sameTokens && sameTotal ? current.data : next,
                    isLoading: false,
                    isRefreshing: false,
                    lastFetchedAt: Date.now(),
                    walletKey: addressString,
                };
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
    lastFetchedAt: null,
    walletKey: null,

    reset: () => {
        inFlightKey = null;
        inFlightPromise = null;
        set({
            data: EMPTY_PORTFOLIO,
            isLoading: true,
            isRefreshing: false,
            lastFetchedAt: null,
            walletKey: null,
        });
    },

    ensurePortfolio: async (connection, address) => {
        const addressString = typeof address === 'string' ? address : address.toString();
        if (!addressString) {
            set({ isLoading: false });
            return;
        }
        await runFetch(connection, addressString, { force: false });
    },

    refresh: async (connection, address) => {
        const addressString = typeof address === 'string' ? address : address.toString();
        if (!addressString) return;
        await runFetch(connection, addressString, { force: true });
    },
}));
