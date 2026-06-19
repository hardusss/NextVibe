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
    const ensurePortfolio = usePortfolioStore(s => s.ensurePortfolio);
    const refreshStore = usePortfolioStore(s => s.refresh);
    const reset = usePortfolioStore(s => s.reset);

    const addressKey = address?.toString() ?? null;
    const connectionRef = useRef(connection);
    connectionRef.current = connection;

    useEffect(() => {
        const conn = connectionRef.current;
        if (!addressKey || !conn) {
            reset();
            return;
        }
        // Delay to avoid blocking initial ProfilePage render
        const timer = setTimeout(() => {
            void ensurePortfolio(conn, addressKey);
        }, 2000);
        return () => clearTimeout(timer);
    }, [addressKey, ensurePortfolio, reset]);

    const refresh = useCallback(async () => {
        const conn = connectionRef.current;
        if (!addressKey || !conn) return;
        await refreshStore(conn, addressKey);
    }, [addressKey, refreshStore]);

    return { data, isLoading, isRefreshing, refresh };
}
