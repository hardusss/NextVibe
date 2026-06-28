/**
 * Kora Paymaster Error Parser
 *
 * Translates raw Kora RPC error responses into structured, user-friendly
 * messages suitable for toast notifications.
 *
 * Kora may return errors for:
 *   - Daily transaction limit exceeded
 *   - Unsupported program invocation
 *   - Unsupported token
 *   - System account creation blocked
 *   - Max lamports exceeded
 *   - Max signatures exceeded
 */

export type PaymasterErrorType =
    | 'LIMIT_EXCEEDED'
    | 'PROGRAM_NOT_ALLOWED'
    | 'TOKEN_NOT_ALLOWED'
    | 'ACCOUNT_CREATION_BLOCKED'
    | 'MAX_LAMPORTS_EXCEEDED'
    | 'MAX_SIGNATURES_EXCEEDED'
    | 'UNKNOWN';

export interface PaymasterError {
    type: PaymasterErrorType;
    userMessage: string;
    raw: string;
}

/**
 * Known error patterns from Kora RPC responses.
 * Order matters — first match wins.
 */
const ERROR_PATTERNS: { pattern: RegExp; type: PaymasterErrorType; message: string }[] = [
    {
        pattern: /transaction limit|max_tx_per_wallet|daily.*limit|rate.*limit/i,
        type: 'LIMIT_EXCEEDED',
        message: "You've used all 10 free daily interactions. Try again tomorrow or pay gas from your wallet.",
    },
    {
        pattern: /program not allowed|program.*not.*supported|unauthorized program/i,
        type: 'PROGRAM_NOT_ALLOWED',
        message: "This action isn't supported by the free tier. The program is not whitelisted.",
    },
    {
        pattern: /token not allowed|token.*not.*supported|unauthorized token/i,
        type: 'TOKEN_NOT_ALLOWED',
        message: "This token isn't supported for gasless transactions. Only SOL, USDC, and SKR are eligible.",
    },
    {
        pattern: /system account creation|account.*creation.*not.*allowed|create.*account/i,
        type: 'ACCOUNT_CREATION_BLOCKED',
        message: "Your wallet needs a small SOL deposit to initialize before using gasless transactions.",
    },
    {
        pattern: /max.*lamports|lamports.*exceeded|amount.*too.*large/i,
        type: 'MAX_LAMPORTS_EXCEEDED',
        message: "Transaction amount exceeds the 1 SOL maximum for sponsored transactions.",
    },
    {
        pattern: /max.*signatures|signatures.*exceeded/i,
        type: 'MAX_SIGNATURES_EXCEEDED',
        message: "Transaction is too complex for gas sponsorship. Try a simpler transaction.",
    },
];

/**
 * Parse a raw error (string, Error, or RPC response object) into a
 * structured `PaymasterError`.
 */
export function parsePaymasterError(error: unknown): PaymasterError {
    const raw = extractErrorString(error);

    for (const { pattern, type, message } of ERROR_PATTERNS) {
        if (pattern.test(raw)) {
            return { type, userMessage: message, raw };
        }
    }

    return {
        type: 'UNKNOWN',
        userMessage: 'Transaction sponsorship failed. Please try again.',
        raw,
    };
}

/**
 * Returns `true` when the error indicates the user should be shown the
 * "fund your wallet" prompt instead of a generic toast.
 */
export function isAccountCreationError(error: unknown): boolean {
    return parsePaymasterError(error).type === 'ACCOUNT_CREATION_BLOCKED';
}

/**
 * Returns `true` when the daily transaction limit has been hit.
 */
export function isLimitExceededError(error: unknown): boolean {
    return parsePaymasterError(error).type === 'LIMIT_EXCEEDED';
}

// ── helpers ──────────────────────────────────────────────────────────

function extractErrorString(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;

    // RPC JSON error shape: { data: { logs: [...] }, message: "..." }
    if (error && typeof error === 'object') {
        const obj = error as Record<string, any>;

        // Nested RPC error
        if (obj.data?.message) return String(obj.data.message);
        if (obj.message) return String(obj.message);

        // Logs array (simulation failures)
        if (Array.isArray(obj.data?.logs)) {
            return obj.data.logs.join(' ');
        }

        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }

    return String(error);
}
