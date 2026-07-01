import { useEffect, useCallback, useRef } from 'react';
import useWalletAddress from './useWalletAddress';
import { usePortfolioStore } from '@/src/stores/portfolioStore';
import type { PortfolioData, TokenAsset } from './usePortfolio.types';

export type { TokenAsset, PortfolioData } from './usePortfolio.types';

export interface UsePortfolioReturn {
    data: PortfolioData;
    isLoading: boolean;
    isRefreshing: boolean;
    refresh: () => Promise<void>;
}

export default function usePortfolio(): UsePortfolioReturn {
    const { address, connection } = useWalletAddress();
    const data = usePortfolioStore(s => s.data);
    const isLoading = usePortfolioStore(s => s.isLoading);
    const isRefreshing = usePortfolioStore(s => s.isRefreshing);
    const fetchPortfolio = usePortfolioStore(s => s.fetchPortfolio);
    const refreshStore = usePortfolioStore(s => s.refresh);
    const reset = usePortfolioStore(s => s.reset);

    const addressKey = address?.toString() ?? null;
    const prevAddressRef = useRef<string | null>(null);

    useEffect(() => {
        if (!addressKey || !connection) {
            // Only reset when the user genuinely disconnects,
            // not when addressKey is temporarily null during re-mounts.
            if (prevAddressRef.current !== null) {
                prevAddressRef.current = null;
                reset();
            }
            return;
        }
        prevAddressRef.current = addressKey;
        void fetchPortfolio(connection, addressKey);
    }, [addressKey, connection, fetchPortfolio, reset]);

    const refresh = useCallback(async () => {
        if (!addressKey || !connection) return;
        await refreshStore(connection, addressKey);
    }, [addressKey, connection, refreshStore]);

    return { data, isLoading, isRefreshing, refresh };
}
