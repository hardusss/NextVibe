import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { seekerCardUrl } from './seekerShare';

type SharingModule = typeof import('expo-sharing');

/**
 * expo-sharing's native side only exists in builds made after it was added,
 * and an OTA update can land on an older build. Importing it there would
 * throw at startup, so it's required lazily, once the native module is known
 * to exist.
 */
export function nativeSharing(): SharingModule | null {
    if (!requireOptionalNativeModule('ExpoSharing')) return null;
    return require('expo-sharing') as SharingModule;
}

/** iOS can share a file through React Native's Share; Android needs expo-sharing. */
export function canShareSeekerImage(): boolean {
    return Platform.OS === 'ios' || nativeSharing() !== null;
}

function cardFileName(username: string): string {
    return `nextvibe-seeker-${username.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60)}.png`;
}

/**
 * Downloads the user's Seeker card and opens the native share sheet with the
 * PNG (Instagram stories, Telegram, saving it for a manual post). Resolves
 * once the sheet closes.
 */
export async function shareSeekerCard(username: string): Promise<void> {
    if (!FileSystem.cacheDirectory) throw new Error('No cache directory');
    const target = `${FileSystem.cacheDirectory}${cardFileName(username)}`;
    const { status, uri } = await FileSystem.downloadAsync(seekerCardUrl(username), target);
    if (status !== 200) {
        FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
        throw new Error(`Seeker card download failed (${status})`);
    }

    const Sharing = nativeSharing();
    if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share your Seeker card' });
    } else if (Platform.OS === 'ios') {
        await Share.share({ url: uri }); // a local file URL shares the image itself
    } else {
        throw new Error('File sharing unavailable in this build');
    }
}

const warmed = new Set<string>();

/**
 * The first request for a new card version renders it on the server. Ask for
 * it when the sheet opens so it's ready before X's crawler fetches the link.
 * HEAD, so the phone doesn't download the image.
 */
export function warmSeekerCard(username: string): void {
    if (warmed.has(username)) return;
    warmed.add(username);
    fetch(seekerCardUrl(username), { method: 'HEAD' }).catch(() => warmed.delete(username));
}
