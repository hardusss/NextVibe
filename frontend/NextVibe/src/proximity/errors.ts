/**
 * One place that turns anything that can go wrong during a tap into copy a
 * person standing next to someone can act on. Pure (no RN imports) so it is
 * unit-tested in node.
 *
 * Copy rules: plain words, say what to do next, never blame the user, and
 * never use reward/earn/activity wording.
 */

export type ProximityErrorKind =
    | 'expired'
    | 'self'
    | 'alreadyMet'
    | 'blocked'
    | 'dailyLimit'
    | 'notCheckedIn'
    | 'notAtVenue'
    | 'locationRequired'
    | 'locationDenied'
    | 'locationServicesOff'
    | 'locationUnavailable'
    | 'mockLocation'
    | 'notFound'
    | 'auth'
    | 'network'
    | 'timeout'
    | 'rateLimited'
    | 'server'
    | 'unknown';

export type ProximityErrorAction = 'openSettings' | 'openLocationSettings' | 'signIn' | 'goIrl';

export interface ProximityErrorInfo {
    kind: ProximityErrorKind;
    title: string;
    message: string;
    /** Repeating the same request can succeed (network blips, location fixed…). */
    retryable: boolean;
    tone: 'error' | 'warning' | 'info';
    action?: ProximityErrorAction;
}

export type ProximityStage = 'preview' | 'confirm' | 'generate' | 'checkin';

/** Errors raised on the client before any request is made. */
export class ProximityClientError extends Error {
    kind: ProximityErrorKind;
    constructor(kind: ProximityErrorKind, message?: string) {
        super(message ?? kind);
        this.kind = kind;
    }
}

type ErrorLike = {
    kind?: ProximityErrorKind;
    code?: string;
    message?: string;
    request?: unknown;
    response?: { status?: number; data?: any };
};

function serverText(data: any): string | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const text = data.error ?? data.detail ?? data.message;
    return typeof text === 'string' && text.trim() ? text.trim() : undefined;
}

function info(
    kind: ProximityErrorKind,
    title: string,
    message: string,
    extra: Partial<Omit<ProximityErrorInfo, 'kind' | 'title' | 'message'>> = {}
): ProximityErrorInfo {
    return { kind, title, message, retryable: false, tone: 'error', ...extra };
}

function fromKind(kind: ProximityErrorKind, stage: ProximityStage, server?: string): ProximityErrorInfo {
    switch (kind) {
        case 'expired':
            return info(kind, 'This tap code expired',
                'Ask them to keep Tap to Meet open, then hold your phones together again.',
                { tone: 'warning' });
        case 'self':
            return info(kind, "That's your own phone",
                'Hold your phone next to someone else’s to meet them.', { tone: 'info' });
        case 'alreadyMet':
            return info(kind, "You've already met",
                server ?? 'You two are already connected — nothing more to do.', { tone: 'info' });
        case 'blocked':
            // One answer for both people: it never says who blocked whom or names them
            return info(kind, "Can't connect",
                "You can't connect with this person.", { tone: 'info' });
        case 'dailyLimit':
            return info(kind, 'Daily tap limit reached',
                server ?? "You've hit today's tap limit. Back at it tomorrow!", { tone: 'warning' });
        case 'notCheckedIn':
            return stage === 'generate'
                ? info(kind, 'Check in first',
                    "Networking here needs an active check-in at this event. Check in, or meet people outside the event.",
                    { tone: 'warning', action: 'goIrl' })
                : info(kind, 'Check in to their event first',
                    "They're networking at an event you haven't checked in to. Check in there, then tap again.",
                    { tone: 'warning' });
        case 'notAtVenue':
            return info(kind, "You're outside the event area",
                stage === 'checkin' || /check in/i.test(server ?? '')
                    ? 'Check-in only works at the venue. Move closer and try again.'
                    : 'Networking only works at the venue. Move closer and try again.',
                { tone: 'warning', retryable: true });
        case 'locationRequired':
            return info(kind, 'Location needed',
                'This event confirms you are at the venue. Allow location for NextVibe, then try again.',
                { tone: 'warning', retryable: true, action: 'openSettings' });
        case 'locationDenied':
            return info(kind, 'Location is off for NextVibe',
                'Allow location in Settings so we can confirm you are at the event.',
                { tone: 'warning', retryable: true, action: 'openSettings' });
        case 'locationServicesOff':
            return info(kind, 'Location Services are off',
                'Turn on Location Services, then try again.',
                { tone: 'warning', retryable: true, action: 'openLocationSettings' });
        case 'locationUnavailable':
            return info(kind, "Couldn't find your location",
                'GPS is slow indoors. Step closer to a window or outside for a moment, then try again.',
                { tone: 'warning', retryable: true });
        case 'mockLocation':
            return info(kind, 'Fake location detected',
                'Turn off location-spoofing apps — taps only count in real life.');
        case 'notFound':
            return info(kind, 'Not found', server ?? 'This event or person no longer exists.');
        case 'auth':
            return info(kind, 'Sign in to continue',
                'Your session has ended. Sign in to NextVibe, then tap again.', { action: 'signIn' });
        case 'network':
            return info(kind, "You're offline",
                'Check your internet connection and try again.', { retryable: true });
        case 'timeout':
            return info(kind, 'The connection is slow',
                'It took too long to reach NextVibe. Try again.', { retryable: true });
        case 'rateLimited':
            return info(kind, 'Too many tries',
                'Wait a few seconds, then try again.', { retryable: true, tone: 'warning' });
        case 'server':
            return info(kind, 'Something went wrong on our side',
                'Try again in a moment.', { retryable: true });
        default:
            return info('unknown', "Couldn't complete the tap",
                server ?? 'Something went wrong. Try again.', { retryable: true });
    }
}

/** Maps a backend message (they are stable strings) to a kind. */
function kindFromServerMessage(text: string): ProximityErrorKind | null {
    const t = text.toLowerCase();
    if (t.includes('invalid or expired')) return 'expired';
    if (t.includes('yourself')) return 'self';
    if (t.includes('already connected') || t.includes('already tapped')) return 'alreadyMet';
    if (t.includes('tap limit')) return 'dailyLimit';
    if (t.includes('check-in to this event') || t.includes('check in to this event')) return 'notCheckedIn';
    if (t.includes('physically present') || t.includes('invalid location coordinates')) return 'notAtVenue';
    if (t.includes('location coordinates are required')) return 'locationRequired';
    if (t.includes('not found') || t.includes('invalid event or user') || t.includes('invalid user')) return 'notFound';
    return null;
}

export function describeProximityError(err: unknown, stage: ProximityStage = 'preview'): ProximityErrorInfo {
    const e = (err ?? {}) as ErrorLike;

    if (err instanceof ProximityClientError || (e.kind && !e.response)) {
        return fromKind(e.kind as ProximityErrorKind, stage);
    }

    const status = e.response?.status;
    const data = e.response?.data;
    const text = serverText(data);
    const code = typeof data?.code === 'string' ? data.code : undefined;

    if (code === 'ALREADY_TAPPED_TODAY') return fromKind('alreadyMet', stage, text);
    if (code === 'BLOCKED') return fromKind('blocked', stage);
    if (code === 'IRL_DAILY_LIMIT') return fromKind('dailyLimit', stage, text);

    if (e.response) {
        if (status === 401) return fromKind('auth', stage);
        const byText = text ? kindFromServerMessage(text) : null;
        if (byText) return fromKind(byText, stage, text);
        if (status === 403) return fromKind('notCheckedIn', stage);
        if (status === 404) return fromKind('notFound', stage);
        if (status === 429) return fromKind('rateLimited', stage);
        if (status !== undefined && status >= 500) return fromKind('server', stage);
        return fromKind('unknown', stage, text);
    }

    if (e.code === 'ECONNABORTED' || (typeof e.message === 'string' && /timeout/i.test(e.message))) {
        return fromKind('timeout', stage);
    }
    if (e.request || (typeof e.message === 'string' && /network/i.test(e.message))) {
        return fromKind('network', stage);
    }
    return fromKind('unknown', stage);
}
