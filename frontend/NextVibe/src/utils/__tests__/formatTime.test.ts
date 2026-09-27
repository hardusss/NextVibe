import timeAgo from '../formatTime';

const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString();

describe('timeAgo', () => {
    it('says one without an s', () => {
        expect(timeAgo(secondsAgo(61))).toBe('1 minute ago');
        expect(timeAgo(secondsAgo(3600 + 5))).toBe('1 hour ago');
        expect(timeAgo(secondsAgo(86400 + 5))).toBe('1 day ago');
    });

    it('counts more with an s', () => {
        expect(timeAgo(secondsAgo(30))).toBe('30 seconds ago');
        expect(timeAgo(secondsAgo(180))).toBe('3 minutes ago');
        expect(timeAgo(secondsAgo(2))).toBe('just now');
        expect(timeAgo(null)).toBe('');
    });
});
