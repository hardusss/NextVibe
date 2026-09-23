import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getMeetPhoto, MeetPhotoApiError, type MeetPhotoState } from '@/src/api/meetPhoto';
import { useMeetPhotoStore } from '@/src/stores/meetPhotoStore';

export type MeetPhotoLoad =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; data: MeetPhotoState }
    | { status: 'missing' }
    | { status: 'error'; error: MeetPhotoApiError };

/** While something is in flight the state is polled too, in case the socket is down. */
const POLL_MS = 5000;

function inFlight(data: MeetPhotoState): boolean {
    return data.status === 'pending' || data.status === 'approved' || (!!data.taking && !data.taking.mine);
}

/**
 * GET /meet/<slug>/photo for a screen: refetches when a socket event or push
 * about the meet arrives (meetPhotoStore revisions), and every 5 s while
 * something is in flight and the app is in the foreground. `set` lets a
 * screen put in the state an action already returned.
 */
export function useMeetPhoto(slug: string | null | undefined, enabled = true) {
    const revision = useMeetPhotoStore((s) => (slug ? s.revisions[slug] ?? 0 : 0));
    const [load, setLoad] = useState<MeetPhotoLoad>(slug && enabled ? { status: 'loading' } : { status: 'idle' });
    const request = useRef(0);

    const refresh = useCallback(async () => {
        if (!slug || !enabled) return;
        const id = ++request.current;
        try {
            const data = await getMeetPhoto(slug);
            if (id === request.current) setLoad({ status: 'ready', data });
        } catch (error) {
            if (id !== request.current) return;
            const err = error as MeetPhotoApiError;
            setLoad((prev) => {
                if (err.status === 404) return { status: 'missing' };
                // Keep showing the last good state through a blip
                return prev.status === 'ready' ? prev : { status: 'error', error: err };
            });
        }
    }, [slug, enabled]);

    useEffect(() => {
        if (!slug || !enabled) {
            setLoad({ status: 'idle' });
            return;
        }
        setLoad((prev) => (prev.status === 'ready' && prev.data.slug === slug ? prev : { status: 'loading' }));
        refresh();
    }, [slug, enabled, revision, refresh]);

    const data = load.status === 'ready' ? load.data : null;
    const polling = !!data && inFlight(data);
    useEffect(() => {
        if (!polling) return;
        let timer: ReturnType<typeof setInterval> | null = null;
        const start = () => {
            if (!timer) timer = setInterval(refresh, POLL_MS);
        };
        const stop = () => {
            if (timer) clearInterval(timer);
            timer = null;
        };
        if (AppState.currentState === 'active') start();
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') {
                refresh();
                start();
            } else {
                stop();
            }
        });
        return () => {
            stop();
            sub.remove();
        };
    }, [polling, refresh]);

    const set = useCallback((next: MeetPhotoState) => {
        request.current++;
        setLoad({ status: 'ready', data: next });
    }, []);

    return { load, data, refresh, set };
}
