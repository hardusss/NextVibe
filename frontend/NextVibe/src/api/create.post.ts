import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";

export default async function createPost(
    content: string,
    mediaUrls: string[],
    location?: string,
    isAiGenerated: boolean = false,
    isCommentsEnabled: boolean = true
): Promise<{ success: boolean; message?: string }> {
    try {
        const TOKEN = await AsyncStorage.getItem("access");
        const OWNER_ID = await AsyncStorage.getItem("id");

        if (!TOKEN || !OWNER_ID) {
            return { success: false, message: "Не знайдено токен або ID користувача" };
        }

        const postUrl = `${GetApiUrl()}/posts/posts/`;
        const mediaUploadUrl = `${GetApiUrl()}/posts/add-media/`;

        // --- 1. Створення посту ---
        const postResponse = await fetch(postUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                about: content,
                owner: OWNER_ID,
                location: location || null,
                is_ai_generated: isAiGenerated,
                is_comments_enabled: isCommentsEnabled,
            }),
        });

        const postData = await postResponse.json();

        if (!postResponse.ok || !postData?.id) {
            console.log("Помилка при створенні посту:", postData);
            return { success: false, message: "Не вдалося створити пост" };
        }

        const postId = postData.id;

        // --- 2. Додавання медіа ---
        if (mediaUrls.length > 0) {
            const formData = new FormData();

            for (const [index, uri] of mediaUrls.entries()) {
                let fixedUri = uri.startsWith("file://") || uri.startsWith("https://")
                    ? uri
                    : `file://${uri}`;

                const isVideo = fixedUri.match(/\.(mov|mp4|mkv|webm|ogg)$/);
                const fileType = isVideo ? "video/mp4" : "image/jpeg";
                const fileName = isVideo ? `video${index}.mp4` : `image${index}.jpg`;

                formData.append("media", {
                    uri: fixedUri,
                    name: fileName,
                    type: fileType,
                } as any);
            }

            formData.append("post", postId.toString());

            const mediaResponse = await fetch(mediaUploadUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${TOKEN}`,
                },
                body: formData,
            });

            const mediaData = await mediaResponse.json();

            if (!mediaResponse.ok) {
                console.log("Помилка при додаванні медіа:", mediaData);
                return { success: false, message: "Не вдалося завантажити медіа" };
            }
        }

        return { success: true, message: "Пост успішно створено" };
    } catch (error) {
        console.log("Помилка у createPost:", error);
        return { success: false, message: "Невідома помилка" };
    }
}
