import axios, { AxiosError } from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export default async function reportPost(postId: number, report_type: string, description?: string) {
    try {
        const token = await storage.getItem("access");
        const reporter = await storage.getItem("id");

        const data = {
            post: postId,
            reporter: Number(reporter),
            report_type: report_type,
            description: description
        }

        const config = {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        }

        if (token) {
            const response = await axios.post(`${GetApiUrl()}/posts/report-post/`, data, config);
            return response;
        } else {
            return null;
        }
    } catch (error) {
        const err = error as AxiosError;
        return err.response?.data;
    }
}