import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function getRecomendatePosts(isReset = false) {
  try {
    const token = await storage.getItem("access");
    const response = await axios.get(`${GetApiUrl()}/posts/recommendation-feed/${isReset ? "?reset=true" : ""}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching recommended posts:", error);
    return null;
  }
}