import { useEffect } from 'react';
import { AppState } from 'react-native';
import { FEATURE_PROOF_OF_MEET } from '@/constants/FeatureFlags';
import { getPendingMeetPhotos } from '@/src/api/meetPhoto';
import { useAppReady } from '@/src/navigation/appReadyStore';
import { openMeetPhotoSheet, useMeetPhotoStore } from '@/src/stores/meetPhotoStore';

/** At most one check a minute, however often the app comes back to the foreground. */
const MIN_INTERVAL_MS = 60_000;

/**
 * A Proof of Meet photo waiting for your answer opens its consent sheet once
 * the app is ready and whenever it comes back to the foreground, so a
 * request whose push was missed (or whose socket event arrived while the app
 * was closed) still reaches you within its 24 hours. Each request opens by
 * itself once per session.
 */
export function useMeetPhotoInbox(userId: number | null): void {
    const ready = useAppReady(true);

    useEffect(() => {
        if (!FEATURE_PROOF_OF_MEET || !userId || !ready) return;
        let last = 0;
        let cancelled = false;
        const check = async () => {
            if (Date.now() - last < MIN_INTERVAL_MS) return;
            last = Date.now();
            try {
                const { data } = await getPendingMeetPhotos();
                const { presented, sheetSlug } = useMeetPhotoStore.getState();
                if (cancelled || sheetSlug) return;
                const next = data.find((request) => !presented[request.slug]);
                if (next) openMeetPhotoSheet(next.slug, 'inbox');
            } catch {
                // Offline or signed out: the next foreground tries again
            }
        };
        check();
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') check();
        });
        return () => {
            cancelled = true;
            sub.remove();
        };
    }, [userId, ready]);
}
