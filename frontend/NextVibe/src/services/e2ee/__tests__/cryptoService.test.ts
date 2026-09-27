jest.mock('expo-secure-store', () => {
    const values = new Map<string, string>();
    return {
        getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
        setItemAsync: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
        __values: values,
    };
});
jest.mock('../keys', () => ({
    getDeviceKey: jest.fn(),
    getDevices: jest.fn(),
    publishDeviceKey: jest.fn(async () => true),
}));

import CryptoService, { LOCKED_TEXT } from '../../CryptoService';
import { legacyEncrypt, newDeviceKeyPair, parseEnvelope, isV3, encryptV3 } from '../core';

const keys = jest.requireMock('../keys');
const secureStore = jest.requireMock('expo-secure-store');

const alice = newDeviceKeyPair();
const bob = newDeviceKeyPair();
const bobTablet = newDeviceKeyPair();
const pub = (d: typeof alice) => ({ device_id: d.deviceId, public_key: d.publicKey });

function asUser(device: typeof alice) {
    keys.getDeviceKey.mockResolvedValue(device);
}

beforeEach(() => {
    jest.clearAllMocks();
    keys.getDevices.mockImplementation(async (ids: number[]) => {
        const all: Record<number, any> = { 1: [pub(alice)], 2: [pub(bob), pub(bobTablet)], 3: [] };
        return Object.fromEntries(ids.map((id) => [id, all[id] ?? null]));
    });
});

describe('CryptoService', () => {
    it('seals v3 for every device when the other person has a key', async () => {
        asUser(alice);
        expect(await CryptoService.mode(1, 2)).toBe('v3');
        const stored = await CryptoService.sealText(1, 2, 'hi Bob', [{ k: 'x', n: 'y', type: 'image/jpeg' }]);
        const envelope = parseEnvelope(stored);
        expect(isV3(envelope)).toBe(true);
        expect(stored).not.toContain('hi Bob');

        for (const device of [bob, bobTablet]) {
            asUser(device);
            const opened = await CryptoService.open(2, 1, stored);
            expect(opened).toEqual({ text: 'hi Bob', media: [{ k: 'x', n: 'y', type: 'image/jpeg' }], state: 'e2ee' });
        }
        asUser(alice);
        expect((await CryptoService.open(1, 2, stored)).text).toBe('hi Bob');
    });

    it("uses the older format while the other person's app has no key", async () => {
        asUser(alice);
        expect(await CryptoService.mode(1, 3)).toBe('legacy');
        const stored = await CryptoService.sealText(1, 3, 'hi Cara');
        expect(JSON.parse(stored).v).toBe(2);
        expect(await CryptoService.open(3, 1, stored)).toEqual({ text: 'hi Cara', state: 'legacy' });
    });

    it('is legacy when the key list is unknown', async () => {
        expect(await CryptoService.mode(1, 99)).toBe('legacy');
        keys.getDevices.mockRejectedValueOnce(new Error('offline'));
        expect(await CryptoService.mode(1, 2)).toBe('legacy');
    });

    it('keeps old chats readable: plain text, v2 and v1', async () => {
        asUser(bob);
        expect(await CryptoService.open(2, 1, 'plain hello')).toEqual({ text: 'plain hello', state: 'plain' });
        const v2 = JSON.stringify(legacyEncrypt(1, 2, 'from last year', 'dev_1'));
        expect(await CryptoService.open(2, 1, v2)).toEqual({ text: 'from last year', state: 'legacy' });
        expect(await CryptoService.decryptMessage(2, 1, v2)).toBe('from last year');

        // v1: this device's own old message, keyed with its old identity
        secureStore.__values.set('e2ee_identity_key_2', JSON.stringify({ privateKey: 'ABCDEFGHxyz' }));
        const secret = 'e2ee_secret_chat_1_2_ABCDEFGH';
        const bytes = Buffer.from('my v1 note', 'utf-8').map((b, i) => b ^ secret.charCodeAt(i % secret.length));
        const v1 = JSON.stringify({ v: 1, ciphertext: Buffer.from(bytes).toString('base64'), nonce: 'x' });
        expect((await CryptoService.open(2, 1, v1)).text).toBe('my v1 note');
    });

    it('says when a v3 message was sealed for other devices only', async () => {
        const stored = JSON.stringify(encryptV3({ t: 'secret' }, alice, [pub(bob)]));
        asUser(newDeviceKeyPair());
        expect(await CryptoService.open(2, 1, stored)).toEqual({ text: LOCKED_TEXT, state: 'locked' });
    });

    it('gives a safety number once both have keys', async () => {
        asUser(alice);
        const ready = await CryptoService.safetyNumber(1, 2);
        expect(ready.status).toBe('ready');
        asUser(bob);
        const fromBob = await CryptoService.safetyNumber(2, 1);
        // Bob's list already has both his devices, so both phones see the same keys
        expect(fromBob).toEqual(ready);
        expect(await CryptoService.safetyNumber(1, 3)).toEqual({ status: 'legacy' });
        expect(await CryptoService.safetyNumber(1, 99)).toEqual({ status: 'offline' });
    });
});
