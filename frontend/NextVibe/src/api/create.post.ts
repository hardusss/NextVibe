import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";
import { Platform } from "react-native";

const getMimeType = (uri: string) => {
    if (uri.match(/\.(jpeg|jpg)$/i)) return "image/jpeg";
    if (uri.match(/\.png$/i)) return "image/png";
    if (uri.match(/\.(mp4|mov|mkv)$/i)) return "video/mp4";
    return "application/octet-stream";
};

export default async function createPost(
    content: string,
    mediaUrls: string[],
    location?: string,
    isAiGenerated: boolean = false,
    isCommentsEnabled: boolean = true
): Promise<{ success: boolean; message?: string }> {
    try {
        const TOKEN = await storage.getItem("access");
        const OWNER_ID = await storage.getItem("id");

        if (!TOKEN || !OWNER_ID) {
            return { success: false, message: "User not found" };
        }

        const postUrl = `${GetApiUrl()}/posts/posts/`;
        const mediaUploadUrl = `${GetApiUrl()}/posts/add-media/`;

        console.log("Creating post body...");
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
            console.error("Post creation failed:", postData);
            return { success: false, message: "Failed to create post text" };
        }

        const postId = postData.id;
        console.log(`Post created with ID: ${postId}. Starting media upload...`);

        if (mediaUrls.length > 0) {
            for (const [index, uri] of mediaUrls.entries()) {
    const formData = new FormData();
    const fileName = `media_${postId}_${index}.jpg`;

    let file;

    if (uri.startsWith("http")) {
        // Remote image convert to Blob
        console.log("Downloading remote image as blob:", uri);
        const response = await fetch(uri);
        const blob = await response.blob();

        file = {
            name: fileName,
            type: blob.type || "image/jpeg",
            uri: uri,
            blob,
        } as any;
    } else {
        // Local file send as usual
        file = {
            uri,
            name: fileName,
            type: getMimeType(uri),
        } as any;
    }

    formData.append("media", file);
    formData.append("post", postId.toString());

    try {
        console.log(`Uploading file ${index + 1}/${mediaUrls.length}...`);

        const mediaResponse = await fetch(mediaUploadUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${TOKEN}`,
            },
            body: formData,
        });

        if (!mediaResponse.ok) {
            const errorText = await mediaResponse.text();
            console.error(`Failed to upload media ${index}:`, errorText);
        } else {
            console.log(`File ${index + 1} uploaded successfully.`);
        }
    } catch (e) {
        console.error(`Upload error:`, e);
    }
}

        }

        console.log("All media uploaded. Triggering moderation...");
        const finalizeUrl = `${GetApiUrl()}/posts/posts/${postId}/finalize/`; 
        await fetch(finalizeUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
        });

        return { success: true, message: "Post created and sent to moderation" };

    } catch (error) {
        console.error("Critical error in createPost:", error);
        return { success: false, message: `Error: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
}