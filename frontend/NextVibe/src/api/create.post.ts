import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";

export default async function createPost(content: string, mediaUrls: string[], location?: string) {
    try {
        const TOKEN = await AsyncStorage.getItem("access");
        const OWNER_ID = await AsyncStorage.getItem("id");

        if (!TOKEN || !OWNER_ID) {
            return;
        }

        const postUrl = `${GetApiUrl()}/posts/posts/`;
        const mediaUploadUrl = `${GetApiUrl()}/posts/add-media/`;

        const postResponse = await fetch(postUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                about: content,
                owner: OWNER_ID,
                location: location || null
            })
        });

        const postData = await postResponse.json();
        
        if (!postResponse.ok) {
            return;
        }

        const postId = postData.id;

        const formData = new FormData();

        for (const [index, uri] of mediaUrls.entries()) {
            let fixedUri = uri.startsWith("file://") || uri.startsWith("https://") ? uri : `file://${uri}`;
            console.log(`📸 Файл ${index + 1}:`, fixedUri);

            const imageResponse = await fetch(fixedUri, { headers: { "User-Agent": "ReactNativeApp/1.0" } });
            const blob = await imageResponse.blob();

            const isVideo = fixedUri.match(/\.(mov|mp4|mkv|webm|ogg)$/);
            const fileType = isVideo ? "video/mp4" : "image/jpeg";
            const fileName = isVideo ? `video${index}.mp4` : `image${index}.jpg`;

            formData.append("media", {
                uri: fixedUri,
                name: fileName,
                type: fileType
            } as any);
        }

        formData.append("post", postId.toString());

        const mediaResponse = await fetch(mediaUploadUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${TOKEN}`,
            },
            body: formData
        });

        const mediaData = await mediaResponse.json();

        if (!mediaResponse.ok) {
            return;
        }

    } catch (error) {
        return;
    }
}
