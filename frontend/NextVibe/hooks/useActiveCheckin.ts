import { useCallback, useEffect, useState } from 'react';
import { ActiveEvent, getActiveCheckins } from '@/src/api/active.checkin';

/**
 * Events the user is currently checked in to (active within the same
 * 24h window the backend uses). `refresh` re-fetches on demand — call it
 * right before routing a Tap to Meet press so the decision is fresh.
 */
export function useActiveCheckin() {
    const [activeEvents, setActiveEvents] = useState<ActiveEvent[]>([]);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async (): Promise<ActiveEvent[]> => {
        setLoading(true);
        try {
            const events = await getActiveCheckins();
            setActiveEvents(events);
            return events;
        } catch (e) {
            console.warn('[useActiveCheckin] fetch failed:', e);
            return activeEvents;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { activeEvents, loading, refresh };
}
