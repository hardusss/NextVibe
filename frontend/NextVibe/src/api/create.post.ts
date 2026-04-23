import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";
import * as FileSystem from 'expo-file-system';

export interface LumaEvent {
    is_luma_event: boolean;
    luma_event_url: string;
    luma_event_verified: boolean;
    luma_event_start_time: Date | string | null | undefined;
    luma_event_end_time: Date | string | null | undefined;
};

function getFileExtension(uri: string): string {
    const uriLower = uri.toLowerCase();

    if (uriLower.includes('.jpg') || uriLower.includes('.jpeg')) return 'jpg';
    if (uriLower.includes('.png')) return 'png';
    if (uriLower.includes('.webp')) return 'webp';
    if (uriLower.includes('.gif')) return 'gif';
    if (uriLower.includes('.heic')) return 'heic';
    if (uriLower.includes('.heif')) return 'heif';
    if (uriLower.includes('.bmp')) return 'bmp';
    if (uriLower.includes('.svg')) return 'svg';

    if (uriLower.includes('.mp4')) return 'mp4';
    if (uriLower.includes('.mov')) return 'mov';
    if (uriLower.includes('.avi')) return 'avi';
    if (uriLower.includes('.webm')) return 'webm';
    if (uriLower.includes('.mkv')) return 'mkv';
    if (uriLower.includes('.m4v')) return 'm4v';
    
    if (uri.startsWith('content://')) {
        if (uri.includes('image')) return 'jpg';
        if (uri.includes('video')) return 'mp4';
    }
    
    return 'jpg';
}

async function normalizeUriForUpload(uri: string, index: number): Promise<string> {
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
        return uri;
    }

    if (uri.startsWith('file://')) {
        return uri;
    }

    if (uri.startsWith('content://') || uri.startsWith('ph://') || 
        uri.startsWith('ph-upload://') || uri.startsWith('assets-library://') ||
        uri.startsWith('blob://')) {
            
        try {
            console.log('Converting local URI to file://', uri);
            
            const fileExtension = getFileExtension(uri);
            const destPath = `${FileSystem.cacheDirectory}upload_${Date.now()}_${index}.${fileExtension}`;
            
            await FileSystem.copyAsync({
                from: uri,
                to: destPath
            });

            console.log('Converted to file://', destPath);
            return destPath;
        } catch (error) {
            console.error('Error converting local URI:', error);
            throw new Error(`Failed to convert URI: ${uri}. Error: ${error}`);
        }
    }

    if (!uri.includes('://')) {
        return `file://${uri}`;
    }

    return uri;
}

export default async function createPost(
    content: string,
    mediaUrls: string[],
    location?: string,
    coords?: Record<string, number>,
    resolution?: number,
    isAiGenerated: boolean = false,
    isCommentsEnabled: boolean = true,
    lumaEvent?: LumaEvent,
): Promise<{ success: boolean; message?: string, postId?: string }> {

    const uploadedTempFiles: string[] = [];

    const clearTemp = async () => {
        for (const tempFile of uploadedTempFiles) {
            try {
                await FileSystem.deleteAsync(tempFile, { idempotent: true });
                console.log('Cleaned up temp file:', tempFile);
            } catch (e) {
                console.error('Error deleting temp file:', e);
            }
        }
    };

    try {
        const TOKEN = await storage.getItem("access");
        const OWNER_ID = await storage.getItem("id");

        if (!TOKEN || !OWNER_ID) {
            return { success: false, message: "User not found" };
        }

        const postUrl = `${GetApiUrl()}/posts/posts/?v2=true`;
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
                coords: coords,
                resolution: resolution,
                is_ai_generated: isAiGenerated,
                is_comments_enabled: isCommentsEnabled,
                is_luma_event: lumaEvent?.is_luma_event,
                luma_event_url: lumaEvent?.luma_event_url,
                luma_event_verified: lumaEvent?.luma_event_verified,
                luma_event_start_time: lumaEvent?.luma_event_start_time, 
                luma_event_end_time: lumaEvent?.luma_event_end_time,
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
            console.log('Original media URIs:', mediaUrls);
            
            for (const [index, uri] of mediaUrls.entries()) {
                try {
                    console.log(`Uploading file ${index + 1}/${mediaUrls.length}...`);
                    
                    let uploadUri = await normalizeUriForUpload(uri, index);
                    
                    if (uri.startsWith("http")) {
                        console.log("Downloading remote image:", uri);
                        
                        const fileExtension = getFileExtension(uri);
                        const localUri = `${FileSystem.cacheDirectory}temp_${postId}_${index}.${fileExtension}`;
                        
                        const downloadResult = await FileSystem.downloadAsync(uri, localUri);
                        uploadUri = downloadResult.uri;
                        uploadedTempFiles.push(uploadUri);
                    } else if (uploadUri !== uri) {
                        uploadedTempFiles.push(uploadUri);
                    }
                    
                    console.log('Final upload URI:', uploadUri);
                    
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
                                "post": postId.toString()
                            }
                        }
                    );
                    
                    if (uploadResponse.status !== 200 && uploadResponse.status !== 201) {
                        console.error(`Failed to upload media ${index}:`, uploadResponse.body);
                    } else {
                        console.log(`File ${index + 1} uploaded successfully.`);
                    }
                    
                } catch (e) {
                    console.error(`Upload error for file ${index}:`, e);
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

        await clearTemp();
        return { success: true, message: "Post created and sent to moderation", postId: postId };

    } catch (error) {
        await clearTemp();
        console.error("Critical error in createPost:", error);
        return { success: false, message: `Error: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
}