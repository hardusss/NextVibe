import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import WebSocketService from '@/src/services/WebSocketService';
import { getUnreadMessagesCount } from '@/src/api/chat';
import { hasSession } from '@/src/utils/session';

/**
 * Total unread chat messages for the signed-in user.
 * Polls the backend and refreshes on live socket traffic (new messages and
 * the user's own read receipts), so a tab/header badge stays current without
 * the consumer wiring any chat state.
 */
export function useUnreadMessagesCount(enabled = true, pollMs = 30000): number {
    const [count, setCount] = useState(0);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const refresh = useCallback(async () => {
        // The tab layout stays mounted after a logout; polling then would only
        // produce 401s.
        if (!(await hasSession())) {
            setCount(0);
            return;
        }
        const next = await getUnreadMessagesCount();
        setCount(next);
    }, []);

    useEffect(() => {
        if (!enabled) return;

        refresh();
        const interval = setInterval(refresh, pollMs);

        // The socket service persists the message/receipt before broadcasting,
        // so a short debounce is enough for the count query to see it.
        const unsubscribe = WebSocketService.addListener((event: any) => {
            if (!event) return;
            if (event.type === 'message' || event.type === 'read_receipt') {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(refresh, 600);
            }
        });

        const appStateSub = AppState.addEventListener('change', (state) => {
            if (state === 'active') refresh();
        });

        return () => {
            clearInterval(interval);
            unsubscribe();
            appStateSub.remove();
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [enabled, pollMs, refresh]);

    return enabled ? count : 0;
}
