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
            return { success: false, message: "User not found" };
        }

        const postUrl = `${GetApiUrl()}/posts/posts/`;
        const mediaUploadUrl = `${GetApiUrl()}/posts/add-media/`;

        // Creating post
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
            return { success: false, message: "Failed to create post" };
        }

        const postId = postData.id;

        // Add media
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
                return { success: false, message: "Failed to upload media" };
            }
        }

        return { success: true, message: "Post successfully created" };
    } catch (error) {
        return { success: false, message: "Error" };
    }
}
