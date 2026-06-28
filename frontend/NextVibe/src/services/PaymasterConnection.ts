import { Connection } from '@solana/web3.js';

/**
 * Kora Paymaster Connection
 *
 * Custom `Connection` factory that injects the `x-api-key` header
 * into every RPC request sent to the NextVibe Paymaster proxy.
 *
 * The Kora proxy intercepts transactions, co-signs them as the fee
 * payer, and forwards them to the Solana network — giving users a
 * gasless experience.
 *
 * Usage:
 *   const conn = getPaymasterConnection();
 *   await conn.sendRawTransaction(serializedTx);
 */

export const PAYMASTER_URL =
    process.env.EXPO_PUBLIC_PAYMASTER_URL || 'https://paymaster.nextvibe.io';

export const PAYMASTER_API_KEY =
    process.env.EXPO_PUBLIC_PAYMASTER_API_KEY || '';

/** Singleton so every consumer shares one connection/socket pool. */
let _instance: Connection | null = null;

/**
 * Returns a `Connection` pointed at the Kora Paymaster RPC,
 * with the required `x-api-key` header injected via `fetchMiddleware`.
 */
export function getPaymasterConnection(): Connection {
    if (_instance) return _instance;

    _instance = new Connection(PAYMASTER_URL, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60_000,
        fetchMiddleware: (info, init, fetch) => {
            // Inject the API key into every outgoing request
            const existingHeaders = (init?.headers as Record<string, string>) ?? {};
            const headers: Record<string, string> = {
                ...existingHeaders,
                'x-api-key': PAYMASTER_API_KEY,
            };
            fetch(info, { ...init, headers });
        },
    });

    return _instance;
}

/**
 * Resets the singleton — useful if the API key changes at runtime
 * or during testing.
 */
export function resetPaymasterConnection(): void {
    _instance = null;
}
