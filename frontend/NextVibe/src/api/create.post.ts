import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";
import * as FileSystem from 'expo-file-system';

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
            console.log(mediaUrls);
            
            for (const [index, uri] of mediaUrls.entries()) {
                try {
                    console.log(`Uploading file ${index + 1}/${mediaUrls.length}...`);
                    
                    // Якщо це віддалене зображення, спочатку завантажуємо його локально
                    let uploadUri = uri;
                    
                    if (uri.startsWith("http")) {
                        console.log("Downloading remote image:", uri);
                        const localUri = `${FileSystem.cacheDirectory}temp_${postId}_${index}.jpg`;
                        const downloadResult = await FileSystem.downloadAsync(uri, localUri);
                        uploadUri = downloadResult.uri;
                    }
                    
                    // uploadAsync сам формує multipart запит
                    const uploadResponse = await FileSystem.uploadAsync(
                        mediaUploadUrl,
                        uploadUri,
                        {
                            fieldName: 'media',
                            httpMethod: 'POST',
                            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                            headers: {
                                "Authorization": `Bearer ${TOKEN}`,
                            },
                            parameters: {
                                "post": postId.toString() // Додаткові поля FormData
                            }
                        }
                    );
                    
                    if (uploadResponse.status !== 200 && uploadResponse.status !== 201) {
                        console.error(`Failed to upload media ${index}:`, uploadResponse.body);
                    } else {
                        console.log(`File ${index + 1} uploaded successfully.`);
                    }
                    
                    // Видаляємо тимчасовий файл, якщо завантажували віддалене зображення
                    if (uri.startsWith("http")) {
                        await FileSystem.deleteAsync(uploadUri, { idempotent: true });
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