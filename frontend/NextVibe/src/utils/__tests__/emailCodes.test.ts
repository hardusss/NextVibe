jest.mock('../storage', () => ({ storage: { setItem: jest.fn(), getItem: jest.fn() } }));

import { apiErrorMessage, codeRequired, retryAfter } from '../../api/emailCodes';

describe('email codes', () => {
    it('reads the code step from a login 403 and a sign-up 201', () => {
        expect(codeRequired({ code: 'EMAIL_NOT_VERIFIED', email: 'a@b.co', resendIn: 42 }, 'x@y.z'))
            .toEqual({ email: 'a@b.co', resendIn: 42, sendError: undefined });
        expect(codeRequired({ verification_required: true, sendError: 'down' }, 'x@y.z'))
            .toEqual({ email: 'x@y.z', resendIn: 60, sendError: 'down' });
    });

    it('ignores answers that carry tokens', () => {
        expect(codeRequired({ user_id: 1, token: { access: 'a', refresh: 'r' } }, 'x@y.z')).toBeNull();
        expect(codeRequired(undefined, 'x@y.z')).toBeNull();
    });

    it("shows the server's words, then a fallback", () => {
        expect(apiErrorMessage({ response: { data: { error: 'That code isn\'t right.' } } }, 'fb')).toBe("That code isn't right.");
        expect(apiErrorMessage({ response: { data: { non_field_errors: ['Invalid email or password.'] } } }, 'fb'))
            .toBe('Invalid email or password.');
        expect(apiErrorMessage({ response: { data: {} } }, 'fb')).toBe('fb');
        expect(apiErrorMessage(new Error('Network Error'), 'fb')).toBe('Check your connection and try again.');
    });

    it('reads how long to wait before a new code', () => {
        expect(retryAfter({ response: { data: { retryIn: 37 } } })).toBe(37);
        expect(retryAfter({ response: { data: {} } })).toBeNull();
    });
});
