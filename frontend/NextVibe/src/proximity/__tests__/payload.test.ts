import { extractProximityToken, parseProximityPayload, payloadKey, toAppPath } from '../payload';

describe('toAppPath', () => {
    it('strips every NextVibe origin and the custom scheme', () => {
        expect(toAppPath('https://nextvibe.io/u/e?t=abc')).toBe('/u/e?t=abc');
        expect(toAppPath('https://www.nextvibe.io/u/12')).toBe('/u/12');
        expect(toAppPath('nextvibe.io/u/12')).toBe('/u/12');
        expect(toAppPath('nextvibe://u/e?t=abc')).toBe('/u/e?t=abc');
        expect(toAppPath('/u/12#frag')).toBe('/u/12');
    });

    it('rejects foreign links', () => {
        expect(toAppPath('https://evil.example/u/e?t=abc')).toBeNull();
        expect(toAppPath('https://nextvibe.io.evil.example/u/e?t=abc')).toBeNull();
        expect(toAppPath('solana:abc?amount=1')).toBeNull();
        expect(toAppPath('')).toBeNull();
    });
});

describe('parseProximityPayload', () => {
    it('reads proximity tokens from /u/e and /e', () => {
        expect(parseProximityPayload('https://nextvibe.io/u/e?t=Ab-9_xYz')).toEqual({ kind: 'token', token: 'Ab-9_xYz' });
        expect(parseProximityPayload('/e?t=Ab-9_xYz')).toEqual({ kind: 'token', token: 'Ab-9_xYz' });
    });

    it('does not mistake ?token= for a proximity token', () => {
        const p = parseProximityPayload('https://nextvibe.io/u/send?amount=1.5&token=SOL&address=Abc');
        expect(p).toEqual({
            kind: 'payment',
            path: '/u/send?amount=1.5&token=SOL&address=Abc',
            amount: '1.5',
            tokenSymbol: 'SOL',
            address: 'Abc',
        });
    });

    it('rejects malformed tokens', () => {
        expect(parseProximityPayload('/u/e?t=')).toEqual({ kind: 'unknown' });
        expect(parseProximityPayload('/u/e?t=<script>')).toEqual({ kind: 'unknown' });
    });

    it('reads profiles and posts', () => {
        expect(parseProximityPayload('https://nextvibe.io/u/42')).toEqual({ kind: 'profile', userId: 42 });
        expect(parseProximityPayload('https://nextvibe.io/u/42/')).toEqual({ kind: 'profile', userId: 42 });
        expect(parseProximityPayload('https://nextvibe.io/u/post/7')).toEqual({ kind: 'post', postId: 7 });
    });

    it('keeps legacy formats routable and ignores everything else', () => {
        expect(parseProximityPayload('/event-checkin?postId=5').kind).toBe('legacy');
        expect(parseProximityPayload('/event-nfc-receive?eventId=1&userId=2').kind).toBe('legacy');
        expect(parseProximityPayload('https://nextvibe.io/').kind).toBe('unknown');
        expect(parseProximityPayload('https://nextvibe.io/u/e').kind).toBe('unknown');
    });
});

describe('helpers', () => {
    it('extracts only tokens', () => {
        expect(extractProximityToken('https://nextvibe.io/u/e?t=abcd1234')).toBe('abcd1234');
        expect(extractProximityToken('https://nextvibe.io/u/42')).toBeNull();
    });

    it('builds stable dedup keys', () => {
        const raw = 'https://nextvibe.io/u/e?t=abcd1234';
        expect(payloadKey(raw, parseProximityPayload(raw))).toBe('t:abcd1234');
        const profile = 'nextvibe.io/u/42';
        expect(payloadKey(profile, parseProximityPayload(profile))).toBe('p:/u/42');
    });
});
