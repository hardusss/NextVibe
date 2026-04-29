import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "@/src/utils/url_api";

export type VibemapEventItem = {
  post_id: number;
  lat: number;
  lng: number;
  image: string | null;
  owner_avatar: string | null;
  owner_username: string;
  owner_id: number;
  about: string;
  luma_event_url: string | null;
  luma_event_start_time: string | null;
  luma_event_end_time: string | null;
  is_active: boolean;
  attendee_count: number;
  request_status: "pending" | "approved" | "rejected" | null;
};

export async function getVibemapEvents(): Promise<VibemapEventItem[]> {
  const TOKEN = await storage.getItem("access");
  const res = await axios.get(`${GetApiUrl()}/posts/get-vibemap-events/`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const data = res.data?.data;
  if (!Array.isArray(data)) return [];
  return data as VibemapEventItem[];
}
