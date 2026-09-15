import { describeProximityError, ProximityClientError } from '../errors';

const axiosError = (status: number, data: any) => ({ response: { status, data } });

const BANNED = /\b(reward|earn|activity|farm|skr)\w*/i;

describe('describeProximityError', () => {
    it('maps an expired token', () => {
        const e = describeProximityError(axiosError(400, { error: 'Token is invalid or expired.' }));
        expect(e.kind).toBe('expired');
        expect(e.retryable).toBe(false);
    });

    it('treats duplicate meets as informational, keeping the server wording', () => {
        const irl = describeProximityError(axiosError(400, {
            error: 'You already tapped with alice today. See you tomorrow!',
            code: 'ALREADY_TAPPED_TODAY',
        }));
        expect(irl.kind).toBe('alreadyMet');
        expect(irl.tone).toBe('info');
        expect(irl.message).toContain('alice');

        const event = describeProximityError(axiosError(400, { error: 'You have already connected with this user at this event.' }));
        expect(event.kind).toBe('alreadyMet');
    });

    it('maps the daily limit by code on 429', () => {
        const e = describeProximityError(axiosError(429, { error: "bob has hit today's tap limit.", code: 'IRL_DAILY_LIMIT' }));
        expect(e.kind).toBe('dailyLimit');
        expect(e.message).toContain('bob');
    });

    it('distinguishes the check-in gate for the broadcaster and the receiver', () => {
        const err = axiosError(403, { error: 'You must check in to this event first.' });
        expect(describeProximityError(err, 'generate').action).toBe('goIrl');
        expect(describeProximityError(err, 'confirm').action).toBeUndefined();
        expect(describeProximityError(axiosError(403, { error: 'You must check-in to this event first.' }), 'confirm').kind)
            .toBe('notCheckedIn');
    });

    it('asks for location when the geofence needs coordinates', () => {
        const e = describeProximityError(axiosError(400, { error: 'Location coordinates are required to check in.' }), 'checkin');
        expect(e.kind).toBe('locationRequired');
        expect(e.action).toBe('openSettings');
        expect(e.retryable).toBe(true);
    });

    it('maps geofence misses', () => {
        const e = describeProximityError(axiosError(400, { error: 'You must be physically present at the event zone to network.' }));
        expect(e.kind).toBe('notAtVenue');
    });

    it('reads DRF `detail` bodies (auth, 404)', () => {
        expect(describeProximityError(axiosError(401, { detail: 'Invalid token' })).kind).toBe('auth');
        expect(describeProximityError(axiosError(404, { detail: 'No Post matches the given query.' })).kind).toBe('notFound');
    });

    it('recognises timeouts and offline requests', () => {
        expect(describeProximityError({ code: 'ECONNABORTED', message: 'timeout of 12000ms exceeded' }).kind).toBe('timeout');
        expect(describeProximityError({ message: 'Network Error', request: {} }).kind).toBe('network');
    });

    it('passes client-side errors through', () => {
        expect(describeProximityError(new ProximityClientError('locationDenied')).kind).toBe('locationDenied');
        expect(describeProximityError(new ProximityClientError('mockLocation')).kind).toBe('mockLocation');
    });

    it('falls back to the server text for unknown 400s and generic copy otherwise', () => {
        expect(describeProximityError(axiosError(400, { error: 'Something odd.' })).message).toBe('Something odd.');
        expect(describeProximityError(axiosError(500, {})).kind).toBe('server');
        expect(describeProximityError(undefined).kind).toBe('unknown');
    });

    it('never uses banned wording in its own copy', () => {
        const kinds = [
            'expired', 'self', 'alreadyMet', 'dailyLimit', 'notCheckedIn', 'notAtVenue', 'locationRequired',
            'locationDenied', 'locationServicesOff', 'locationUnavailable', 'mockLocation', 'notFound', 'auth', 'network', 'timeout',
            'rateLimited', 'server', 'unknown',
        ] as const;
        for (const kind of kinds) {
            for (const stage of ['preview', 'confirm', 'generate', 'checkin'] as const) {
                const e = describeProximityError(new ProximityClientError(kind), stage);
                expect(`${e.title} ${e.message}`).not.toMatch(BANNED);
            }
        }
    });
});
