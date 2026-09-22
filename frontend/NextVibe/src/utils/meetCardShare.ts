import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { nativeSharing } from './seekerCardShare';

type MediaLibraryModule = typeof import('expo-media-library');

/**
 * expo-media-library has been in every build, but like expo-sharing it's
 * required only once the native module is known to exist (OTA updates reach
 * old builds).
 */
function mediaLibrary(): MediaLibraryModule | null {
    if (!requireOptionalNativeModule('ExpoMediaLibrary')) return null;
    return require('expo-media-library') as MediaLibraryModule;
}

async function download(url: string, slug: string): Promise<string> {
    if (!FileSystem.cacheDirectory) throw new Error('No cache directory');
    const target = `${FileSystem.cacheDirectory}nextvibe-meet-${slug.replace(/[^A-Za-z0-9]/g, '')}.png`;
    const { status, uri } = await FileSystem.downloadAsync(url, target);
    if (status !== 200) {
        FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
        throw new Error(`Meet card download failed (${status})`);
    }
    return uri;
}

async function shareFile(uri: string): Promise<void> {
    const Sharing = nativeSharing();
    if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Save your Proof of Meet card' });
    } else if (Platform.OS === 'ios') {
        await Share.share({ url: uri }); // a local file URL shares the image itself
    } else {
        throw new Error('File sharing unavailable in this build');
    }
}

/**
 * Saves the card (the story size, as previewed) to the photo library: add-only
 * access on iOS, no permission on Android 13+. If saving isn't possible (no
 * permission, old build) the share sheet opens with the image instead, which
 * has its own "Save Image". Resolves with what happened.
 */
export async function saveMeetCard(url: string, slug: string): Promise<'saved' | 'shared'> {
    const uri = await download(url, slug);
    const library = mediaLibrary();
    if (library) {
        try {
            const permission = await library.requestPermissionsAsync(true);
            if (permission.granted) {
                await library.saveToLibraryAsync(uri);
                return 'saved';
            }
        } catch {
            // fall back to the share sheet
        }
    }
    await shareFile(uri);
    return 'shared';
}

const warmed = new Set<string>();

/**
 * The first request for a card renders it on the server. Ask for it as soon
 * as a meet is on screen, so it's ready before X's crawler comes. HEAD, so the
 * phone doesn't download the image.
 */
export function warmMeetCard(url: string): void {
    if (warmed.has(url)) return;
    warmed.add(url);
    fetch(url, { method: 'HEAD' }).catch(() => warmed.delete(url));
}
