/**
 * Proof of Meet photos: the selfie two people take together at a tap
 * (backend posts/src/meet_photos.py). Every call answers only the two people
 * in the meet; for anyone else the meet doesn't exist (404).
 */
import axios from "axios";
import GetApiUrl from "../utils/url_api";
import { storage } from "../utils/storage";

export type MeetPhotoStatus =
    | 'none'
    | 'draft'
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'expired'
    | 'moderation_failed'
    | 'minted'
    | 'taken_down';

export interface MeetPhotoUser {
    user_id: number;
    username: string;
    avatar: string | null;
    seeker_verified: boolean;
    official: boolean;
}

export interface MeetPhoto {
    id: number;
    status: Exclude<MeetPhotoStatus, 'none'>;
    role: 'photographer' | 'subject';
    photographer: MeetPhotoUser;
    subject: MeetPhotoUser;
    /** The card render (1080×1350): signed for 10 minutes before approval, public after. */
    preview_url: string | null;
    og_preview_url: string | null;
    sent_at: string | null;
    expires_at: string | null;
    decided_at: string | null;
    retakes_left: number;
    /** Approved; the cNFTs are being minted. */
    minting: boolean;
    asset_ids: { photographer: string | null; subject: string | null };
    my_asset_id: string | null;
    /** Live for the other person; yours lands when you connect a wallet. */
    waiting_for_wallet: boolean;
    post_id: number | null;
    /** Hidden from your own profile. */
    hidden: boolean;
}

/** GET /meet/<slug>/photo */
export interface MeetPhotoState {
    slug: string;
    /** The server can take photos at all (its private storage is set up). */
    available: boolean;
    status: MeetPhotoStatus;
    photo: MeetPhoto | null;
    other: MeetPhotoUser;
    /** Someone holds the camera right now. */
    taking: { user_id: number; username: string; mine: boolean } | null;
    can_start: boolean;
    rejections_left: number;
    uploads_left: number;
}

export interface MeetPhotoListItem {
    slug: string;
    id: number;
    status: MeetPhotoStatus;
    role: 'photographer' | 'subject';
    /** null when the other account is blocked or deleted. */
    other: MeetPhotoUser | null;
    preview_url: string | null;
    created_at: string;
    taken_down_at: string | null;
    post_id: number | null;
    asset_ids: { photographer: string | null; subject: string | null };
}

export class MeetPhotoApiError extends Error {
    constructor(
        public code: string,
        message: string,
        public status: number | null,
        public extra: Record<string, any> = {},
    ) {
        super(message);
    }
}

const base = (slug: string) => `${GetApiUrl()}/meet/${encodeURIComponent(slug)}/photo`;

async function headers(): Promise<Record<string, string>> {
    const token = await storage.getItem("access");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function toError(error: unknown): MeetPhotoApiError {
    if (axios.isAxiosError(error)) {
        const data: any = error.response?.data ?? {};
        const status = error.response?.status ?? null;
        if (status === 429) return new MeetPhotoApiError('RATE_LIMITED', 'Too many photos for now. Try again in a while.', status);
        if (!error.response) return new MeetPhotoApiError('NETWORK', 'Check your connection and try again.', null);
        const { error: message, code, ...extra } = data;
        return new MeetPhotoApiError(code ?? `HTTP_${status}`, message ?? 'Something went wrong. Try again.', status, extra);
    }
    return new MeetPhotoApiError('UNKNOWN', 'Something went wrong. Try again.', null);
}

async function call<T>(run: (h: Record<string, string>) => Promise<{ data: T }>): Promise<T> {
    try {
        return (await run(await headers())).data;
    } catch (error) {
        throw toError(error);
    }
}

export const getMeetPhoto = (slug: string) =>
    call<MeetPhotoState>((h) => axios.get(base(slug), { headers: h, timeout: 10000 }));

export const lockMeetPhoto = (slug: string) =>
    call<MeetPhotoState>((h) => axios.post(`${base(slug)}/lock`, {}, { headers: h, timeout: 10000 }));

/** A photo or a retake: stripped, checked and rendered on the server (a few seconds). */
export function uploadMeetPhoto(slug: string, fileUri: string): Promise<MeetPhotoState> {
    const form = new FormData();
    const uri = fileUri.startsWith('file://') ? fileUri : `file://${fileUri}`;
    form.append('image', { uri, name: 'selfie.jpg', type: 'image/jpeg' } as any);
    return call<MeetPhotoState>((h) => axios.post(base(slug), form, {
        headers: { ...h, 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
    }));
}

export const sendMeetPhoto = (slug: string) =>
    call<MeetPhotoState>((h) => axios.post(`${base(slug)}/send`, {}, { headers: h, timeout: 15000 }));

export const cancelMeetPhoto = (slug: string) =>
    call<MeetPhotoState>((h) => axios.post(`${base(slug)}/cancel`, {}, { headers: h, timeout: 10000 }));

/** The subject's answer. Approving runs moderation and publishes the card (a few seconds). */
export const decideMeetPhoto = (slug: string, approve: boolean) =>
    call<MeetPhotoState>((h) => axios.post(`${base(slug)}/decision`, { approve }, { headers: h, timeout: 60000 }));

export const takeDownMeetPhoto = (slug: string) =>
    call<{ slug: string; status: MeetPhotoStatus; id: number }>((h) =>
        axios.post(`${base(slug)}/takedown`, {}, { headers: h, timeout: 30000 }));

export const setMeetPhotoCaption = (slug: string, about: string) =>
    call<{ slug: string; post_id: number; about: string }>((h) =>
        axios.post(`${base(slug)}/caption`, { about }, { headers: h, timeout: 20000 }));

export const setMeetPhotoHidden = (slug: string, hidden: boolean) =>
    call<{ slug: string; hidden: boolean }>((h) =>
        axios.post(`${base(slug)}/hide`, { hidden }, { headers: h, timeout: 10000 }));

export const getPendingMeetPhotos = () =>
    call<{ available: boolean; data: (MeetPhoto & { slug: string })[] }>((h) =>
        axios.get(`${GetApiUrl()}/meet/photos/pending`, { headers: h, timeout: 10000 }));

export const getMyMeetPhotos = () =>
    call<{ data: MeetPhotoListItem[] }>((h) =>
        axios.get(`${GetApiUrl()}/meet/photos/mine`, { headers: h, timeout: 10000 }));
