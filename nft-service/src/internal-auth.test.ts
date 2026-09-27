import { describe, expect, test } from 'bun:test'
import { isAuthorized, mintsDisabled, MINT_ROUTES } from './internal-auth'

describe('isAuthorized', () => {
    test('without a configured secret every caller passes', () => {
        expect(isAuthorized('', null)).toBe(true)
        expect(isAuthorized(undefined, 'anything')).toBe(true)
    })
    test('with a secret only the exact header passes', () => {
        expect(isAuthorized('s3cret', 's3cret')).toBe(true)
        expect(isAuthorized('s3cret', null)).toBe(false)
        expect(isAuthorized('s3cret', 's3cre')).toBe(false)
        expect(isAuthorized('s3cret', 'S3CRET')).toBe(false)
    })
})

describe('mintsDisabled', () => {
    test('only true or 1 turns minting off', () => {
        expect(mintsDisabled('true')).toBe(true)
        expect(mintsDisabled('1')).toBe(true)
        expect(mintsDisabled(undefined)).toBe(false)
        expect(mintsDisabled('false')).toBe(false)
    })
    test('covers every route that spends from the backend wallet', () => {
        for (const route of ['/mint', '/mint/og', '/mint/meet', '/collect/prepare', '/collect/submit']) {
            expect(MINT_ROUTES.has(route)).toBe(true)
        }
        expect(MINT_ROUTES.has('/tree')).toBe(false)
    })
})
