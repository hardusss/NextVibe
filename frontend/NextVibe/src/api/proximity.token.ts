import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export type InteractionType = 'checkin' | 'networking' | 'irl';

// A hung request must surface as an error, not an eternal spinner.
const PROXIMITY_TIMEOUT_MS = 12000;

export interface GenerateTokenResponse {
    token: string;
    // The server owns the final mode: an 'irl' request from a checked-in
    // user comes back as 'networking' with the event attached.
    interaction_type?: InteractionType;
    event_id?: number | null;
}

export interface VerifyTokenResponse {
    // Networking / IRL response fields
    success?: boolean;
    preview?: boolean; // true when nothing was granted yet (confirmation pending)
    interaction_type?: string;
    source?: string; // 'irl' on IRL taps
    message?: string;
    earned_points?: number;
    scanned_user?: {
        user_id: number;
        username: string;
        avatar: string | null;
        is_official: boolean;
        is_seeker_verified?: boolean;
    };
    // The Proof of Meet a confirmed meet wrote (nextvibe.io/u/meet/<slug>)
    meet_slug?: string;
    meet_url?: string;
    // Checkin response fields
    verified?: boolean;
    post_id?: number;
    user_id?: number;
    username?: string;
    avatar?: string | null;
    post_image?: string | null;
    post_name?: string;
    // Error
    error?: string;
}

export const generateProximityToken = async (
    interactionType: InteractionType,
    eventId?: number
): Promise<GenerateTokenResponse> => {
    const TOKEN = await storage.getItem("access");
    const response = await axios.post(
        `${GetApiUrl()}/posts/proximity/generate-token/`,
        {
            interaction_type: interactionType,
            ...(eventId !== undefined && { event_id: eventId }),
        },
        {
            headers: { Authorization: `Bearer ${TOKEN}` },
            timeout: PROXIMITY_TIMEOUT_MS,
        }
    );
    return response.data;
};

export const verifyProximityToken = async (
    token: string,
    latitude?: number,
    longitude?: number
): Promise<VerifyTokenResponse> => {
    const TOKEN = await storage.getItem("access");
    const response = await axios.post(
        `${GetApiUrl()}/posts/proximity/verify-token/`,
        {
            token,
            ...(latitude !== undefined && { latitude }),
            ...(longitude !== undefined && { longitude }),
        },
        {
            headers: { Authorization: `Bearer ${TOKEN}` },
            timeout: PROXIMITY_TIMEOUT_MS,
        }
    );
    return response.data;
};

/**
 * Dry-run of verify: validates the token and returns who's on the other
 * side (+ the REP at stake) without granting anything. The grant happens
 * only when verifyProximityToken is called after the user confirms.
 */
export const previewProximityToken = async (
    token: string,
    latitude?: number,
    longitude?: number
): Promise<VerifyTokenResponse> => {
    const TOKEN = await storage.getItem("access");
    const response = await axios.post(
        `${GetApiUrl()}/posts/proximity/verify-token/`,
        {
            token,
            preview: true,
            ...(latitude !== undefined && { latitude }),
            ...(longitude !== undefined && { longitude }),
        },
        {
            headers: { Authorization: `Bearer ${TOKEN}` },
            timeout: PROXIMITY_TIMEOUT_MS,
        }
    );
    return response.data;
};
