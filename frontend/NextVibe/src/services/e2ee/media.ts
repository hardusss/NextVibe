/**
 * Photos and videos in v3 chats: sealed on the phone before upload (each with
 * its own key, carried inside the encrypted message), and opened into the
 * app's cache folder to be shown. The server and the media bucket only ever
 * hold the sealed bytes.
 */
import * as FileSystem from 'expo-file-system/legacy';
import nacl from 'tweetnacl';
import { Buffer } from 'buffer';
import { decryptBytes, encryptBytes, type MediaKey } from './core';

const Base64 = FileSystem.EncodingType.Base64;
const CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}e2ee-media/`;

/** Reads a local file and seals it: base64 of the sealed bytes, ready to send, and its key. */
export async function sealFile(uri: string, type: string): Promise<{ data: string; key: MediaKey }> {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: Base64 });
    const { sealed, key } = encryptBytes(new Uint8Array(Buffer.from(base64, 'base64')), type);
    return { data: Buffer.from(sealed).toString('base64'), key };
}

export function extensionFor(type?: string): string {
    const t = (type || '').toLowerCase();
    if (t.includes('video')) return t.includes('quicktime') ? 'mov' : 'mp4';
    if (t.includes('png')) return 'png';
    if (t.includes('gif')) return 'gif';
    if (t.includes('webp')) return 'webp';
    return 'jpg';
}

function cachePath(url: string, key: MediaKey): string {
    const digest = Buffer.from(nacl.hash(new Uint8Array(Buffer.from(`${url}|${key.n}`, 'utf-8')))).toString('hex');
    return `${CACHE_DIR}${digest.slice(0, 40)}.${extensionFor(key.type)}`;
}

const opening = new Map<string, Promise<string>>();

/**
 * A local file:// URI of the opened photo or video (downloaded and decrypted
 * once, then cached). `keys`: its own key first; the others of the message are
 * tried after it.
 */
export function openFile(url: string, keys: MediaKey[]): Promise<string> {
    const key = keys[0];
    if (!key) return Promise.reject(new Error('No key for this file'));
    const target = cachePath(url, key);
    const running = opening.get(target);
    if (running) return running;

    const task = (async () => {
        const cached = await FileSystem.getInfoAsync(target);
        if (cached.exists) return target;
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => {});
        const download = `${target}.part`;
        try {
            const result = await FileSystem.downloadAsync(url, download);
            if (result.status < 200 || result.status >= 300) throw new Error(`Download failed (${result.status})`);
            const sealed = new Uint8Array(Buffer.from(
                await FileSystem.readAsStringAsync(download, { encoding: Base64 }), 'base64'));
            let plain: Uint8Array | null = null;
            for (const candidate of keys) {
                plain = decryptBytes(sealed, candidate);
                if (plain) break;
            }
            if (!plain) throw new Error("This file can't be opened on this phone");
            await FileSystem.writeAsStringAsync(target, Buffer.from(plain).toString('base64'), { encoding: Base64 });
            return target;
        } finally {
            FileSystem.deleteAsync(download, { idempotent: true }).catch(() => {});
        }
    })();

    opening.set(target, task);
    task.then(() => opening.delete(target), () => opening.delete(target));
    return task;
}
