import {
    decryptBytes,
    decryptV3,
    encryptBytes,
    encryptV3,
    fromBase64,
    isV3,
    legacyDecrypt,
    legacyEncrypt,
    newDeviceKeyPair,
    parseEnvelope,
    safetyNumber,
    toBase64,
    type DeviceKeyPair,
} from '../core';

const publicOf = (device: DeviceKeyPair) => ({ device_id: device.deviceId, public_key: device.publicKey });

describe('v3 messages', () => {
    const alicePhone = newDeviceKeyPair();
    const aliceTablet = newDeviceKeyPair();
    const bobPhone = newDeviceKeyPair();
    const bobTablet = newDeviceKeyPair();
    const stranger = newDeviceKeyPair();

    it('every device of both people opens it, nobody else does', () => {
        const payload = { t: 'Привіт 👋 café', m: [{ k: 'a', n: 'b', type: 'image/jpeg' }] };
        const envelope = encryptV3(payload, alicePhone, [publicOf(aliceTablet), publicOf(bobPhone), publicOf(bobTablet)]);
        for (const device of [alicePhone, aliceTablet, bobPhone, bobTablet]) {
            expect(decryptV3(envelope, device)).toEqual(payload);
        }
        expect(decryptV3(envelope, stranger)).toBeNull();
        // The server sees no text
        expect(JSON.stringify(envelope)).not.toContain('café');
    });

    it('the sender can always read their own message', () => {
        const envelope = encryptV3({ t: 'note to self' }, alicePhone, []);
        expect(decryptV3(envelope, alicePhone)).toEqual({ t: 'note to self', m: undefined });
    });

    it('a changed ciphertext, key or sender key is refused', () => {
        const envelope = encryptV3({ t: 'hello' }, alicePhone, [publicOf(bobPhone)]);
        const bytes = fromBase64(envelope.ciphertext);
        bytes[0] ^= 1;
        expect(decryptV3({ ...envelope, ciphertext: toBase64(bytes) }, bobPhone)).toBeNull();
        expect(decryptV3({ ...envelope, sender_key: stranger.publicKey }, bobPhone)).toBeNull();
        expect(decryptV3({ ...envelope, keys: {} }, bobPhone)).toBeNull();
    });

    it('skips devices with broken keys', () => {
        const envelope = encryptV3({ t: 'x' }, alicePhone, [{ device_id: 'bad', public_key: 'nope' }, publicOf(bobPhone)]);
        expect(Object.keys(envelope.keys).sort()).toEqual([alicePhone.deviceId, bobPhone.deviceId].sort());
    });

    it('parses as v3 from the stored text', () => {
        const envelope = encryptV3({ t: 'x' }, alicePhone, [publicOf(bobPhone)]);
        const parsed = parseEnvelope(JSON.stringify(envelope));
        expect(isV3(parsed)).toBe(true);
    });
});

describe('photos and videos', () => {
    it('open only with their own key', () => {
        const bytes = new Uint8Array(1000).map((_, i) => i % 251);
        const { sealed, key } = encryptBytes(bytes, 'image/jpeg');
        expect(Array.from(decryptBytes(sealed, key)!)).toEqual(Array.from(bytes));
        expect(key.type).toBe('image/jpeg');
        const other = encryptBytes(bytes).key;
        expect(decryptBytes(sealed, other)).toBeNull();
    });
});

describe('older messages', () => {
    it('v2 reads the same on both sides, emoji included', () => {
        const envelope = legacyEncrypt(7, 42, 'old message 🎉', 'dev_7');
        expect(legacyDecrypt(envelope, 7, 42)).toBe('old message 🎉');
        expect(legacyDecrypt(envelope, 42, 7)).toBe('old message 🎉');
    });

    it('reads a v2 message written by the previous app', () => {
        // "Hi 👋 from v2" XORed with "e2ee_secret_chat_1_2", as the previous CryptoService did
        const previous = { v: 2, ciphertext: 'LVtFlcDi7kMUFxsyQx5T', nonce: 'AAAAAAAAAAAAAAAA', sender_device_id: 'dev_1_x' };
        expect(legacyDecrypt(previous, 1, 2)).toBe('Hi 👋 from v2');
        expect(legacyDecrypt(previous, 2, 1)).toBe('Hi 👋 from v2');
    });

    it('plain text and other JSON are not envelopes', () => {
        expect(parseEnvelope('hello')).toBeNull();
        expect(parseEnvelope('{"hello": 1}')).toBeNull();
        expect(parseEnvelope('{"ciphertext": ')).toBeNull();
        expect(parseEnvelope(JSON.stringify(legacyEncrypt(1, 2, 'x', 'd')))).not.toBeNull();
    });
});

describe('safety number', () => {
    const a = [newDeviceKeyPair().publicKey, newDeviceKeyPair().publicKey];
    const b = [newDeviceKeyPair().publicKey];

    it('is the same on both phones and has 12 groups of 5 digits', () => {
        const mine = safetyNumber(3, a, 9, b);
        expect(mine).toBe(safetyNumber(9, b, 3, [...a].reverse()));
        expect(mine).toMatch(/^(\d{5} ){11}\d{5}$/);
    });

    it('changes when a device changes', () => {
        expect(safetyNumber(3, a, 9, b)).not.toBe(safetyNumber(3, a, 9, [newDeviceKeyPair().publicKey]));
    });
});
