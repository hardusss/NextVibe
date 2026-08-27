/**
 * Wallet Logger Utility
 *
 * Dedicated structured logger for wallet connection lifecycle, authentication,
 * deep linking, encryption, and error diagnosis across LazorKit and MWA.
 */

export const WalletTag = {
    LAZORKIT: 'Wallet:LazorKit',
    MWA_ANDROID: 'Wallet:MWA:Android',
    MWA_IOS: 'Wallet:MWA:iOS',
    MWA: 'Wallet:MWA',
    STATE: 'Wallet:State',
    API: 'Wallet:API',
    AUTH: 'Wallet:Auth',
} as const;

export type WalletTagType = typeof WalletTag[keyof typeof WalletTag] | string;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface WalletLogEntry {
    timestamp: string;
    level: LogLevel;
    tag: string;
    message: string;
    data?: any;
    error?: any;
}

const MAX_HISTORY_LENGTH = 250;
const logHistory: WalletLogEntry[] = [];

/**
 * Safely serialize any value to JSON string without throwing on circular structures
 */
export function safeStringify(value: any, indent = 2): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);

    const seen = new WeakSet();
    try {
        return JSON.stringify(
            value,
            (key, val) => {
                if (typeof val === 'function') {
                    return `[Function: ${val.name || 'anonymous'}]`;
                }
                if (typeof val === 'bigint') {
                    return `${val.toString()}n`;
                }
                if (val instanceof Error) {
                    return {
                        name: val.name,
                        message: val.message,
                        stack: val.stack,
                    };
                }
                if (typeof val === 'object' && val !== null) {
                    if (seen.has(val)) {
                        return '[Circular]';
                    }
                    seen.add(val);
                }
                return val;
            },
            indent
        );
    } catch (err) {
        return `[Unserializable: ${String(err)}]`;
    }
}

/**
 * Safely extracts error details from any kind of error object
 * (Axios errors, Solana RPC errors, Error instances, string errors, etc.)
 */
export function serializeError(error: unknown): Record<string, any> {
    if (!error) return { message: 'Unknown error (falsy)' };

    if (typeof error === 'string') {
        return { message: error };
    }

    if (error instanceof Error) {
        const serialized: Record<string, any> = {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };

        const anyErr = error as any;
        if (anyErr.code) serialized.code = anyErr.code;
        if (anyErr.status) serialized.status = anyErr.status;

        // Axios error handling (sanitize to prevent circular references)
        if (anyErr.isAxiosError || anyErr.response) {
            serialized.axios = {
                status: anyErr.response?.status,
                statusText: anyErr.response?.statusText,
                data: anyErr.response?.data,
                url: anyErr.config?.url,
                method: anyErr.config?.method,
            };
        }

        // Solana RPC / Simulation errors
        if (anyErr.data?.logs) {
            serialized.solanaLogs = anyErr.data.logs;
        }
        if (anyErr.logs) {
            serialized.solanaLogs = anyErr.logs;
        }
        if (anyErr.cause && typeof anyErr.cause === 'object') {
            serialized.cause = anyErr.cause.message || String(anyErr.cause);
        }

        return serialized;
    }

    if (typeof error === 'object') {
        try {
            const obj = error as Record<string, any>;
            const serialized: Record<string, any> = {};

            if (obj.message) serialized.message = String(obj.message);
            if (obj.code) serialized.code = obj.code;
            if (obj.status) serialized.status = obj.status;
            if (obj.response?.data) serialized.responseData = obj.response.data;
            if (obj.response?.status) serialized.responseStatus = obj.response.status;

            return serialized;
        } catch {
            return { message: String(error) };
        }
    }

    return { message: String(error) };
}

/**
 * Extracts a concise, human-readable error description suitable for UI toasts
 */
export function extractErrorMessage(error: unknown): string {
    if (!error) return 'Unknown wallet error';
    if (typeof error === 'string') {
        const lower = error.toLowerCase();
        if (lower.includes('<!doctype') || lower.includes('<html') || lower.includes('<head') || lower.includes('<body>')) {
            return 'Server error. Please try again later.';
        }
        return error;
    }

    const anyErr = error as any;

    if (typeof anyErr?.response?.status === 'number' && anyErr.response.status >= 500) {
        return 'Server error. Please try again later.';
    }

    if (anyErr?.response?.data) {
        const data = anyErr.response.data;
        if (typeof data === 'string') {
            const lower = data.toLowerCase();
            if (lower.includes('<!doctype') || lower.includes('<html') || lower.includes('<head') || lower.includes('<body>')) {
                return 'Server error. Please try again later.';
            }
            return data;
        }
        if (data.error) {
            const str = String(data.error);
            if (str.toLowerCase().includes('<!doctype') || str.toLowerCase().includes('<html')) {
                return 'Server error. Please try again later.';
            }
            return str;
        }
        if (data.detail) {
            const str = String(data.detail);
            if (str.toLowerCase().includes('<!doctype') || str.toLowerCase().includes('<html')) {
                return 'Server error. Please try again later.';
            }
            if (anyErr.response?.status === 401) {
                return `Auth required: ${str}`;
            }
            return str;
        }
        if (data.message) return String(data.message);
        try {
            return JSON.stringify(data);
        } catch {}
    }

    if (anyErr?.response?.status === 401) {
        return 'Not authenticated. Please log in first.';
    }

    if (anyErr?.message) {
        const msg = String(anyErr.message);
        if (msg.toLowerCase().includes('<!doctype') || msg.toLowerCase().includes('<html')) {
            return 'Server error. Please try again later.';
        }
        return msg;
    }

    return 'Wallet error';
}

function formatTimestamp(): string {
    const d = new Date();
    const pad = (n: number, z = 2) => String(n).padStart(z, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function recordLog(entry: WalletLogEntry) {
    logHistory.push(entry);
    if (logHistory.length > MAX_HISTORY_LENGTH) {
        logHistory.shift();
    }
}

export const walletLogger = {
    debug(tag: WalletTagType, message: string, data?: any) {
        const timestamp = formatTimestamp();
        recordLog({ timestamp, level: 'debug', tag, message, data });

        const dataStr = data !== undefined ? ` | ${safeStringify(data)}` : '';
        const output = `[WALLET_LOG] [${timestamp}] [${tag}] [DEBUG] ${message}${dataStr}`;
        console.log(output);
    },

    info(tag: WalletTagType, message: string, data?: any) {
        const timestamp = formatTimestamp();
        recordLog({ timestamp, level: 'info', tag, message, data });

        const dataStr = data !== undefined ? ` | ${safeStringify(data)}` : '';
        const output = `[WALLET_LOG] [${timestamp}] [${tag}] [INFO] ${message}${dataStr}`;
        console.log(output);
    },

    warn(tag: WalletTagType, message: string, data?: any) {
        const timestamp = formatTimestamp();
        recordLog({ timestamp, level: 'warn', tag, message, data });

        const dataStr = data !== undefined ? ` | ${safeStringify(data)}` : '';
        const output = `[WALLET_LOG] [${timestamp}] [${tag}] [WARN] ${message}${dataStr}`;
        console.warn(output);
    },

    error(tag: WalletTagType, message: string, error?: unknown, data?: any) {
        const timestamp = formatTimestamp();
        const serialized = error ? serializeError(error) : undefined;
        recordLog({ timestamp, level: 'error', tag, message, data, error: serialized });

        const errorDetailsStr = serialized ? `\n[FULL_ERROR_DETAILS]:\n${safeStringify(serialized, 2)}` : '';
        const dataDetailsStr = data !== undefined ? `\n[DATA_DETAILS]:\n${safeStringify(data, 2)}` : '';
        const logLine = `🚨 [WALLET_LOG] [${timestamp}] [${tag}] [ERROR] ${message}${errorDetailsStr}${dataDetailsStr}`;
        console.error(logLine);
    },

    /**
     * Get the in-memory log history (up to last 250 items)
     */
    getRecentLogs(): WalletLogEntry[] {
        return [...logHistory];
    },

    /**
     * Print all recent logs to console formatted
     */
    printLogs() {
        console.log(`=== NextVibe Wallet Log History (${logHistory.length} entries) ===`);
        for (const entry of logHistory) {
            console.log(`[${entry.timestamp}] [${entry.tag}] [${entry.level.toUpperCase()}] ${entry.message}`);
            if (entry.data) console.log('  Data:', safeStringify(entry.data));
            if (entry.error) console.log('  Error:', safeStringify(entry.error));
        }
        console.log('=== End Wallet Log History ===');
    },

    /**
     * Clear recorded logs
     */
    clearLogs() {
        logHistory.length = 0;
    }
};

// Expose globally for quick debugging in Hermes / React Native console
try {
    const g = globalThis as any;
    g.__WALLET_LOGS__ = logHistory;
    g.printWalletLogs = () => walletLogger.printLogs();
} catch {}

export default walletLogger;
