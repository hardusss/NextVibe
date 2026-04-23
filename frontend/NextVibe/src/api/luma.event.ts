import axios, { AxiosError } from "axios";
import GetApiUrl from "@/src/utils/url_api";

export interface LumaEventPreview {
  title?: string | null;
  cover_image?: string | null;
  description?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: {
    name?: string | null;
    address?: string | null;
    url?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
}
export function extractBackendError(e: unknown): string {
  if (e instanceof AxiosError) {
    const data = e.response?.data;
    // { "status": "error", "error": "no_code_or_expired" }
    if (data?.error) return data.error;
    // DRF validation: { "field": ["message"] } або { "detail": "..." }
    if (data?.detail) return String(data.detail);
    if (typeof data === "object" && data !== null) {
      const first = Object.values(data)[0];
      if (Array.isArray(first)) return String(first[0]);
    }
    if (e.response?.status === 429) return "Too many requests. Please wait.";
    if (e.response?.status === 502) return "Could not reach Luma. Try again.";
    if (e.response?.status === 400) return "Bad request. Check the link.";
  }
  return "Something went wrong. Try again.";
}

export async function previewLumaEvent(
  luma_url: string
): Promise<{ event: LumaEventPreview; code: string }> {
  const res = await axios.post(`${GetApiUrl()}/posts/luma-event/preview/`, { luma_url });
  return res.data?.data as { event: LumaEventPreview; code: string };
}

export async function verifyLumaEvent(
  luma_url: string
): Promise<{ verified: boolean; code: string; event: LumaEventPreview }> {
  const res = await axios.post(`${GetApiUrl()}/posts/luma-event/verify/`, { luma_url });
  return res.data?.data as { verified: boolean; code: string; event: LumaEventPreview };
}