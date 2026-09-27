/**
 * End-to-end encryption for chats, format v3 (pure functions, no storage or
 * network; see keys.ts for those).
 *
 * - Every app install ("device") has an X25519 key pair; the secret key never
 *   leaves the phone. Public keys are published through the realtime API.
 * - Each message gets a fresh random key. The payload (text, and the keys of
 *   its photos and videos) is sealed with it (XSalsa20-Poly1305, nacl.secretbox),
 *   and the message key is sealed for every device of both people with
 *   nacl.box (the sender's device key + that device's public key).
 * - Photos and videos are sealed the same way before upload, each with its own
 *   key, which travels inside the message payload.
 *
 * Older messages keep their formats: v2 (and v1) used a key anyone could work
 * out from the two user ids, so they stay readable on every device; plain text
 * is shown as is. v2 is still sent while the other person's app has no device
 * key yet (legacyEncrypt), so they can read it.
 */
import nacl from 'tweetnacl';
import { Buffer } from 'buffer';

export const V3 = 3;

export interface DeviceKeyPair {
    deviceId: string;
    publicKey: string; // base64, 32 bytes
    secretKey: string; // base64, 32 bytes
}

export interface PublicDevice {
    device_id: string;
    public_key: string; // base64, 32 bytes
}

/** How to open one photo or video: its own key and nonce, and what it is. */
export interface MediaKey {
    k: string; // base64 key
    n: string; // base64 nonce
    type?: string; // image/jpeg, video/mp4…
}

export interface Payload {
    t: string;
    m?: MediaKey[];
}

export interface EnvelopeV3 {
    v: 3;
    sender_device_id: string;
    sender_key: string;
    nonce: string;
    ciphertext: string;
    keys: Record<string, { n: string; k: string }>;
}

export interface LegacyEnvelope {
    v: number;
    ciphertext: string;
    nonce: string;
    sender_device_id?: string;
    media_encryption_key?: string;
}

export const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
export const fromBase64 = (text: string) => new Uint8Array(Buffer.from(text, 'base64'));
const utf8 = (text: string) => new Uint8Array(Buffer.from(text, 'utf-8'));
const fromUtf8 = (bytes: Uint8Array) => Buffer.from(bytes).toString('utf-8');

export function newDeviceKeyPair(): DeviceKeyPair {
    const pair = nacl.box.keyPair();
    return {
        deviceId: `d_${Buffer.from(nacl.randomBytes(16)).toString('hex')}`,
        publicKey: toBase64(pair.publicKey),
        secretKey: toBase64(pair.secretKey),
    };
}

export function isValidPublicKey(key: unknown): key is string {
    if (typeof key !== 'string' || key.length !== 44) return false;
    try {
        return fromBase64(key).length === nacl.box.publicKeyLength;
    } catch {
        return false;
    }
}

/** Seals the payload for every device in `recipients` (the sender's own device is added). */
export function encryptV3(payload: Payload, sender: DeviceKeyPair, recipients: PublicDevice[]): EnvelopeV3 {
    const messageKey = nacl.randomBytes(nacl.secretbox.keyLength);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const ciphertext = nacl.secretbox(utf8(JSON.stringify(payload)), nonce, messageKey);
    const senderSecret = fromBase64(sender.secretKey);

    const devices = new Map<string, string>();
    devices.set(sender.deviceId, sender.publicKey);
    for (const device of recipients) {
        if (device && isValidPublicKey(device.public_key) && device.device_id) {
            devices.set(device.device_id, device.public_key);
        }
    }

    const keys: EnvelopeV3['keys'] = {};
    devices.forEach((publicKey, deviceId) => {
        const keyNonce = nacl.randomBytes(nacl.box.nonceLength);
        keys[deviceId] = {
            n: toBase64(keyNonce),
            k: toBase64(nacl.box(messageKey, keyNonce, fromBase64(publicKey), senderSecret)),
        };
    });

    return {
        v: V3,
        sender_device_id: sender.deviceId,
        sender_key: sender.publicKey,
        nonce: toBase64(nonce),
        ciphertext: toBase64(ciphertext),
        keys,
    };
}

/** The payload, or null when this device can't open it (not addressed to it, or tampered with). */
export function decryptV3(envelope: EnvelopeV3, device: DeviceKeyPair): Payload | null {
    try {
        const sealed = envelope.keys?.[device.deviceId];
        if (!sealed || !isValidPublicKey(envelope.sender_key)) return null;
        const messageKey = nacl.box.open(fromBase64(sealed.k), fromBase64(sealed.n),
            fromBase64(envelope.sender_key), fromBase64(device.secretKey));
        if (!messageKey) return null;
        const plain = nacl.secretbox.open(fromBase64(envelope.ciphertext), fromBase64(envelope.nonce), messageKey);
        if (!plain) return null;
        const payload = JSON.parse(fromUtf8(plain));
        if (!payload || typeof payload.t !== 'string') return null;
        return { t: payload.t, m: Array.isArray(payload.m) ? payload.m : undefined };
    } catch {
        return null;
    }
}

/** A photo or video, sealed with its own key before upload. */
export function encryptBytes(bytes: Uint8Array, type?: string): { sealed: Uint8Array; key: MediaKey } {
    const key = nacl.randomBytes(nacl.secretbox.keyLength);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    return { sealed: nacl.secretbox(bytes, nonce, key), key: { k: toBase64(key), n: toBase64(nonce), type } };
}

export function decryptBytes(sealed: Uint8Array, key: MediaKey): Uint8Array | null {
    try {
        return nacl.secretbox.open(sealed, fromBase64(key.n), fromBase64(key.k));
    } catch {
        return null;
    }
}

// ─── Older formats ──────────────────────────────────────────────────────────

const legacySecret = (userA: number, userB: number) =>
    `e2ee_secret_chat_${Math.min(userA, userB)}_${Math.max(userA, userB)}`;

const xor = (data: Uint8Array, secret: string) => {
    const key = utf8(secret);
    return data.map((byte, i) => byte ^ key[i % key.length]);
};

/** v2: what apps before v3 can read (the key follows from the two user ids). */
export function legacyEncrypt(senderUserId: number, targetUserId: number, text: string, senderDeviceId: string): LegacyEnvelope {
    return {
        v: 2,
        ciphertext: toBase64(xor(utf8(text), legacySecret(senderUserId, targetUserId))),
        nonce: toBase64(nacl.randomBytes(12)),
        sender_device_id: senderDeviceId,
    };
}

/**
 * v2 (and v1, whose key also mixed in the sending device's old private key:
 * only that device could read it) messages.
 */
export function legacyDecrypt(envelope: LegacyEnvelope, currentUserId: number, otherUserId: number,
    legacyPrivateKey?: string | null): string {
    const secret = envelope.v >= 2 || !legacyPrivateKey
        ? legacySecret(currentUserId, otherUserId)
        : `${legacySecret(currentUserId, otherUserId)}_${legacyPrivateKey.slice(0, 8)}`;
    return fromUtf8(xor(fromBase64(envelope.ciphertext), secret));
}

/** A parsed envelope of any version, or null for plain text. */
export function parseEnvelope(raw: unknown): EnvelopeV3 | LegacyEnvelope | null {
    let value: any = raw;
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed.startsWith('{') || !trimmed.includes('"ciphertext"')) return null;
        try {
            value = JSON.parse(trimmed);
        } catch {
            return null;
        }
    }
    if (!value || typeof value !== 'object' || typeof value.ciphertext !== 'string') return null;
    return value;
}

export const isV3 = (envelope: EnvelopeV3 | LegacyEnvelope | null): envelope is EnvelopeV3 =>
    !!envelope && envelope.v === V3 && typeof (envelope as EnvelopeV3).keys === 'object';

// ─── Safety number ──────────────────────────────────────────────────────────

function fingerprint(userId: number, publicKeys: string[]): string {
    const keys = [...new Set(publicKeys)].sort();
    let digest = nacl.hash(utf8(`nextvibe-safety-number:1:${userId}:${keys.join(',')}`));
    for (let i = 0; i < 1024; i++) digest = nacl.hash(digest);
    let digits = '';
    for (let chunk = 0; chunk < 6; chunk++) {
        let value = 0;
        for (let i = 0; i < 5; i++) value = value * 256 + digest[chunk * 5 + i];
        digits += String(value % 100000).padStart(5, '0');
    }
    return digits;
}

/**
 * 60 digits in 12 groups of 5, the same on both phones. It changes when
 * either person adds a device, so comparing it in person shows that nobody
 * sits between the two of you.
 */
export function safetyNumber(userA: number, keysA: string[], userB: number, keysB: string[]): string {
    const [first, second] = userA <= userB
        ? [fingerprint(userA, keysA), fingerprint(userB, keysB)]
        : [fingerprint(userB, keysB), fingerprint(userA, keysA)];
    return (first + second).match(/.{5}/g)!.join(' ');
}
