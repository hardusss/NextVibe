/**
 * Pure resolution of the Tap to Meet mode from the user's active check-ins.
 *
 * Mirrors the server-side rule in GenerateProximityTokenView: IRL is only for
 * users with no active check-in; a single active event goes straight to event
 * networking; several active events need the user to choose.
 *
 * Kept dependency-free so it can be unit-tested without a React Native
 * environment.
 */

export interface ActiveEventLike {
    event_id: number;
    event_name: string;
}

export type TapMode<E extends ActiveEventLike = ActiveEventLike> =
    | { mode: 'irl' }
    | { mode: 'event'; eventId: number }
    | { mode: 'choose'; events: E[] };

export function resolveTapMode<E extends ActiveEventLike>(events: E[]): TapMode<E> {
    if (events.length === 1) {
        return { mode: 'event', eventId: events[0].event_id };
    }
    if (events.length > 1) {
        return { mode: 'choose', events };
    }
    return { mode: 'irl' };
}
