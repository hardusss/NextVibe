import { timingSafeEqual } from 'node:crypto'

/** Routes that make the backend wallet pay; MINTS_DISABLED turns them off. */
export const MINT_ROUTES = new Set(['/mint', '/mint/og', '/mint/meet', '/collect/prepare', '/collect/submit'])

/**
 * Whether a call carries the shared secret (x-internal-secret). With no
 * secret configured every caller is accepted, as before, so the service can
 * be deployed before the API sends the header.
 */
export function isAuthorized(secret: string | undefined, header: string | null): boolean {
    if (!secret) return true
    if (!header) return false
    const given = Buffer.from(header)
    const expected = Buffer.from(secret)
    return given.length === expected.length && timingSafeEqual(given, expected)
}

/** MINTS_DISABLED=true (or 1) stops every mint; the API's queue waits and retries later. */
export function mintsDisabled(value: string | undefined = process.env.MINTS_DISABLED): boolean {
    return value === 'true' || value === '1'
}
