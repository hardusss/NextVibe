import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export type InteractionType = 'checkin' | 'networking';

export interface GenerateTokenResponse {
    token: string;
}

export interface VerifyTokenResponse {
    // Networking response fields
    success?: boolean;
    interaction_type?: string;
    message?: string;
    earned_points?: number;
    scanned_user?: {
        user_id: number;
        username: string;
        avatar: string | null;
        is_official: boolean;
    };
    // Checkin response fields
    verified?: boolean;
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
    eventId: number
): Promise<GenerateTokenResponse> => {
    const TOKEN = await storage.getItem("access");
    const response = await axios.post(
        `${GetApiUrl()}/posts/proximity/generate-token/`,
        {
            interaction_type: interactionType,
            event_id: eventId,
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
