import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function getRecomendatePosts(
  seenIds: number[] = []
) {
  try {
    const token = await storage.getItem("access");
    const response = await axios.get(`${GetApiUrl()}/posts/recommendation-feed/`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        // Only sending seen IDs is sufficient for the new backend logic
        seen: seenIds.join(','),
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching recommended posts:", error);
    return null;
  }
}