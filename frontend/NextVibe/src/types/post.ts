import { PostMedia } from "@/components/PostDetails/PostMediaItem";
import { CollectInfo } from "@/src/api/collect";

export interface PostData {
    user_id: number;
    post_id: number;
    username: string;
    avatar: string | null;
    official: boolean;
    seeker_verified: boolean;
    is_og: boolean;
    og_edition: number | null;
    invited_count: number;
    about: string;
    count_likes: number;
    media: PostMedia[];
    create_at: string;
    is_ai_generated: boolean;
    location: string | null;
    moderation_status: string;
    is_comments_enabled: boolean;
    liked_posts: number[];
    comments_count: number;
    is_nft: boolean;
    is_owner: boolean;
    already_claimed: boolean;
    sold_out: boolean;
    minted_count: number;
    total_supply: number;
    collect?: CollectInfo | null;
    owner_wallet: string | null;
    is_luma_event?: boolean;
    luma_event_url?: string;
    luma_event_start_time?: string;
    luma_event_end_time?: string;
    event_request_status?: "pending" | "approved" | "rejected" | null;
}