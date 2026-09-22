import { useCallback, useEffect, useState } from 'react';
import getMeet from '@/src/api/meet';
import { warmMeetCard } from '@/src/utils/meetCardShare';
import type { MeetData } from '@/src/utils/meetShare';

export type MeetState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; meet: MeetData }
    | { status: 'missing' }
    | { status: 'error' };

/**
 * GET /meet/<slug> for a screen or sheet (`reloadKey` refetches, e.g. when
 * the same meet is opened again). Once loaded, the server is asked to render
 * the link-preview card, so it's ready before X's crawler comes.
 */
export function useMeet(slug: string | null | undefined, reloadKey = 0): [MeetState, () => void] {
    const [state, setState] = useState<MeetState>(slug ? { status: 'loading' } : { status: 'idle' });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!slug) {
            setState({ status: 'idle' });
            return;
        }
        let cancelled = false;
        setState({ status: 'loading' });
        getMeet(slug)
            .then((meet) => {
                if (cancelled) return;
                if (!meet) {
                    setState({ status: 'missing' });
                    return;
                }
                warmMeetCard(meet.card_url);
                setState({ status: 'ready', meet });
            })
            .catch(() => {
                if (!cancelled) setState({ status: 'error' });
            });
        return () => {
            cancelled = true;
        };
    }, [slug, reloadKey, attempt]);

    const retry = useCallback(() => setAttempt((n) => n + 1), []);
    return [state, retry];
}
