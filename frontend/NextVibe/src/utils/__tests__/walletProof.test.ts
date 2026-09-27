import { detachedSignature, proofMessage, signWalletProof } from '../walletProof';

const encode = (text: string) => new TextEncoder().encode(text);
const signature = Uint8Array.from({ length: 64 }, (_, i) => i + 1);

describe('walletProof', () => {
    it('writes the message the server accepts', () => {
        expect(proofMessage(1790000000000)).toBe('Verify wallet for NextVibe.\nNonce: 1790000000000');
    });

    it('keeps a bare 64-byte signature', () => {
        expect(Array.from(detachedSignature(signature, encode('hi')))).toEqual(Array.from(signature));
    });

    it('takes the signature out of message + signature and signature + message', () => {
        const message = encode(proofMessage(1));
        const joined = new Uint8Array([...message, ...signature]);
        expect(Array.from(detachedSignature(joined, message))).toEqual(Array.from(signature));
        const reversed = new Uint8Array([...signature, ...message]);
        expect(Array.from(detachedSignature(reversed, message))).toEqual(Array.from(signature));
    });

    it('signs the message and sends the signature as a list', async () => {
        const signMessage = jest.fn(async () => signature);
        const proof = await signWalletProof(signMessage, 42);
        expect(signMessage).toHaveBeenCalledWith(encode('Verify wallet for NextVibe.\nNonce: 42'));
        expect(proof).toEqual({ message: 'Verify wallet for NextVibe.\nNonce: 42', signature: Array.from(signature) });
    });

    it('gives null when there is no wallet, a refusal or an error', async () => {
        expect(await signWalletProof(undefined)).toBeNull();
        expect(await signWalletProof(async () => null)).toBeNull();
        expect(await signWalletProof(async () => { throw new Error('declined'); })).toBeNull();
    });
});
