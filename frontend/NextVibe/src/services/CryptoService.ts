import * as SecureStore from 'expo-secure-store';
import {
    decryptV3,
    encryptV3,
    isV3,
    legacyDecrypt,
    legacyEncrypt,
    parseEnvelope,
    safetyNumber,
    type MediaKey,
} from './e2ee/core';
import { getDeviceKey, getDevices, publishDeviceKey } from './e2ee/keys';

/** Old v1 identity (random bytes); only this device's own v1 messages used it. */
const LEGACY_IDENTITY_PREFIX = 'e2ee_identity_key_';

export const LOCKED_TEXT = '🔒 Encrypted message';

export type MessageState =
    /** Plain text (very old messages, or anything that isn't an envelope). */
    | 'plain'
    /** v1/v2: readable on every device. */
    | 'legacy'
    /** v3: sealed for this device and opened. */
    | 'e2ee'
    /** v3 not sealed for this device (e.g. sent before this phone had a key). */
    | 'locked';

export interface OpenedMessage {
    text: string;
    media?: MediaKey[];
    state: MessageState;
}

export type SafetyState =
    | { status: 'ready'; number: string }
    /** The other person's app has no key yet: messages go in the older format. */
    | { status: 'legacy' }
    | { status: 'offline' };

/**
 * Chat encryption for the app (see e2ee/core.ts for the format).
 * - sealText / mode: v3 whenever the other person has a device key, else v2
 *   so their older app can still read it.
 * - open / decryptMessage: every format ever sent, so old chats keep working.
 */
class CryptoService {
    private static instance: CryptoService;

    public static getInstance(): CryptoService {
        if (!CryptoService.instance) CryptoService.instance = new CryptoService();
        return CryptoService.instance;
    }

    /** Publishes this phone's key so others can send it v3 messages (idempotent). */
    public ensurePublished(userId: number): Promise<boolean> {
        if (!userId) return Promise.resolve(false);
        return publishDeviceKey(userId).catch(() => false);
    }

    /** 'v3' when the other person has at least one device key, else 'legacy'. */
    public async mode(senderUserId: number, targetUserId: number): Promise<'v3' | 'legacy'> {
        if (!senderUserId || !targetUserId) return 'legacy';
        try {
            const devices = await getDevices([targetUserId]);
            return (devices[targetUserId]?.length ?? 0) > 0 ? 'v3' : 'legacy';
        } catch {
            return 'legacy';
        }
    }

    /**
     * The stored message text: a v3 envelope for every device of both people
     * (with the keys of its photos and videos), or a v2 one in 'legacy' mode.
     */
    public async sealText(senderUserId: number, targetUserId: number, text: string,
        media?: MediaKey[], mode?: 'v3' | 'legacy'): Promise<string> {
        const chosen = mode ?? await this.mode(senderUserId, targetUserId);
        const device = await getDeviceKey(senderUserId);
        if (chosen === 'v3') {
            const devices = await getDevices([targetUserId, senderUserId]);
            const recipients = [...(devices[targetUserId] ?? []), ...(devices[senderUserId] ?? [])];
            return JSON.stringify(encryptV3({ t: text, m: media?.length ? media : undefined }, device, recipients));
        }
        return JSON.stringify(legacyEncrypt(senderUserId, targetUserId, text, device.deviceId));
    }

    /** Opens any stored message text for this device. */
    public async open(currentUserId: number, otherUserId: number | undefined, raw: unknown): Promise<OpenedMessage> {
        const envelope = parseEnvelope(raw);
        if (!envelope) {
            const text = typeof raw === 'string' ? raw : ((raw as any)?.content || (raw as any)?.text || '');
            return { text, state: 'plain' };
        }
        if (isV3(envelope)) {
            try {
                const device = await getDeviceKey(currentUserId);
                const payload = decryptV3(envelope, device);
                if (payload) return { text: payload.t, media: payload.m, state: 'e2ee' };
            } catch {
                // Falls through to locked
            }
            return { text: LOCKED_TEXT, state: 'locked' };
        }
        try {
            const legacyKey = envelope.v >= 2 ? null : await this.legacyPrivateKey(currentUserId);
            return {
                text: legacyDecrypt(envelope, currentUserId, otherUserId || currentUserId, legacyKey),
                state: 'legacy',
            };
        } catch {
            return { text: LOCKED_TEXT, state: 'locked' };
        }
    }

    /** Text only, for previews (chat list, notifications). */
    public async decryptMessage(currentUserId: number, senderUserId: number, raw: unknown, targetUserId?: number): Promise<string> {
        const other = targetUserId || (senderUserId === currentUserId ? currentUserId : senderUserId);
        return (await this.open(currentUserId, other, raw)).text;
    }

    /** The safety number to compare in person, from both people's device keys. */
    public async safetyNumber(myUserId: number, otherUserId: number): Promise<SafetyState> {
        const mine = await getDeviceKey(myUserId);
        const devices = await getDevices([myUserId, otherUserId], true);
        const theirs = devices[otherUserId];
        if (theirs === null || theirs === undefined) return { status: 'offline' };
        if (theirs.length === 0) return { status: 'legacy' };
        const myKeys = [...(devices[myUserId] ?? []).map((d) => d.public_key), mine.publicKey];
        return { status: 'ready', number: safetyNumber(myUserId, myKeys, otherUserId, theirs.map((d) => d.public_key)) };
    }

    private async legacyPrivateKey(userId: number): Promise<string | null> {
        try {
            const stored = await SecureStore.getItemAsync(`${LEGACY_IDENTITY_PREFIX}${userId}`);
            return stored ? JSON.parse(stored).privateKey ?? null : null;
        } catch {
            return null;
        }
    }
}

export default CryptoService.getInstance();
