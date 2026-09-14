import { resolveTapMode } from '../resolveTapMode';

const event = (id: number, name = `Event ${id}`) => ({ event_id: id, event_name: name });

describe('resolveTapMode', () => {
    it('resolves to IRL when there is no active check-in', () => {
        expect(resolveTapMode([])).toEqual({ mode: 'irl' });
    });

    it('resolves to event mode for a single active check-in', () => {
        expect(resolveTapMode([event(42, 'Solana Meetup')])).toEqual({
            mode: 'event',
            eventId: 42,
        });
    });

    it('asks the user to choose between several active check-ins, preserving order', () => {
        const events = [event(1), event(2), event(3)];
        const resolved = resolveTapMode(events);
        expect(resolved.mode).toBe('choose');
        if (resolved.mode === 'choose') {
            expect(resolved.events.map((e) => e.event_id)).toEqual([1, 2, 3]);
        }
    });
});
