import axios, { AxiosError } from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export default async function getComments(post_id: number) {
    try {
        const token = await storage.getItem("access");
        if (token) {
            const response = await axios.get(`${GetApiUrl()}/posts/get-comments/${post_id}/`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            return response.data;
        } else {
            return null;
        }
    } catch (error) {
        const err = error as AxiosError;
        return err.response?.data;
    }
}