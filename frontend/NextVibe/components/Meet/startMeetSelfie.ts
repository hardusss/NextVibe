import type { Router } from 'expo-router';
import { lockMeetPhoto, MeetPhotoApiError, type MeetPhotoState } from '@/src/api/meetPhoto';
import { track } from '@/src/utils/analytics';

export type StartSelfieResult =
    | { ok: true; state: MeetPhotoState }
    | { ok: false; error: MeetPhotoApiError };

/**
 * "Take a selfie together": lock the meet (the first of the two phones to
 * ask is the photographer), then open the camera. When the other phone got
 * there first, LOCKED names who is taking the photo.
 */
export async function startMeetSelfie(
    router: Router,
    slug: string,
    other?: string | null,
    beforeNavigate?: () => void,
): Promise<StartSelfieResult> {
    try {
        const state = await lockMeetPhoto(slug);
        track('meet_selfie_started');
        beforeNavigate?.();
        router.push({ pathname: '/meet-selfie' as any, params: { slug, other: other ?? state.other.username } });
        return { ok: true, state };
    } catch (error) {
        return { ok: false, error: error as MeetPhotoApiError };
    }
}
