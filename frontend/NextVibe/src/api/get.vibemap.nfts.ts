import axios from "axios";
import GetApiUrl from "@/src/utils/url_api";

export type VibemapNftItem = {
  post_id: number;
  lat: number | null;
  lng: number | null;
  image: string | null;
  owner_avatar: string | null;
};

export async function getVibemapNfts(): Promise<VibemapNftItem[]> {
  const res = await axios.get(`${GetApiUrl()}/posts/get-vibemap-nfts/`);
  const data = res.data?.data;
  if (!Array.isArray(data)) return [];
  return data as VibemapNftItem[];
}

