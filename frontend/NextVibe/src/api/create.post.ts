import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";

export default async function createPost(content: string, mediaUrls: string[], location?: string) {
    try {
        const TOKEN = await AsyncStorage.getItem("access");
        const OWNER_ID = await AsyncStorage.getItem("id");

        if (!TOKEN || !OWNER_ID) {
            console.error("Token або Owner ID не знайдено");
            return;
        }

        const url = `${GetApiUrl()}/posts/posts/`;

        const data = {
            about: content,
            owner: OWNER_ID,
            location: location
        };

        const config = {
            headers: {
                "Authorization": `Bearer ${TOKEN}`,
                "Content-Type": "application/json"
            }
        };

        const response = await axios.post(url, data, config);

        if (response.status === 201) {
            const postId = response.data.id;
            console.log("Post створено:", postId);

            const mediaUploadUrl = `${GetApiUrl()}/posts/add-media/`;
            const formData = new FormData();

            for (const [index, uri] of mediaUrls.entries()) {
                const fixedUri = uri.startsWith('file://') ? uri : `file://${uri}`;
                console.log(`Обробка зображення ${index}: ${fixedUri}`);

                const imageResponse = await fetch(fixedUri);
                const blob = await imageResponse.blob();

                formData.append("media", {
                    uri: fixedUri,
                    name: fixedUri.endsWith(".mov") || fixedUri.endsWith(".mp4") || fixedUri.endsWith(".mkv") || fixedUri.endsWith(".webm") || fixedUri.endsWith(".ogg") ? `image${postId}-${index}.mov` : `image${index}.jpg`,
                    type: blob.type
                } as any);
            }

            formData.append("post", postId.toString());

            const mediaResponse = await axios.post(mediaUploadUrl, formData, {
                headers: {
                    "Authorization": `Bearer ${TOKEN}`,
                    "Content-Type": "multipart/form-data"
                }
            });

            if (mediaResponse.status === 201) {
                console.log("Media files uploaded successfully");
            } else {
                console.error("Помилка при завантаженні медіа", mediaResponse.status, mediaResponse.data);
            }
        } else {
            console.error("Помилка при створенні поста", response.status, response.data);
        }
    } catch (error) {
        console.error("Помилка при відправленні запиту:", error);
    }
}
