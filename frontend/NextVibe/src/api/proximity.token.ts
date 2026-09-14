import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export type InteractionType = 'checkin' | 'networking' | 'irl';

export interface GenerateTokenResponse {
    token: string;
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
        }
    );
    return response.data;
};
