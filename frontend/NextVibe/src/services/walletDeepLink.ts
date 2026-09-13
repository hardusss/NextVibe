import nacl from 'tweetnacl';
// @ts-ignore
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import qs from 'qs';
import * as Linking from 'expo-linking';
import { AppState, AppStateStatus, DeviceEventEmitter, NativeEventSubscription, Platform } from 'react-native';
import { storage } from '@/src/utils/storage';
import { walletLogger, WalletTag } from '@/src/utils/walletLogger';
import saveWallet from '@/src/api/save.wallet';

/**
 * iOS external-wallet deep-link handshake (Phantom / Solflare / Backpack).
 *
 * Owns the whole lifecycle: building the connect universal link, receiving the
 * encrypted redirect, decrypting it, persisting the connected wallet, and
 * saving the address to the backend when no screen is around to do it (cold
 * start). The pending handshake (dapp secret key) is persisted to SecureStore
 * before opening the wallet, so a redirect that cold-starts the app can still
 * be decrypted.
 */

export type DeepLinkWalletType = 'phantom' | 'solflare' | 'backpack';

export interface DeepLinkConnection {
    address: string;
    walletType: DeepLinkWalletType;
    label: string;
}

export const WALLET_DEEPLINK_EVENTS = {
    connected: 'walletDeepLink:connected',
    disconnected: 'walletDeepLink:disconnected',
} as const;

export const DEEPLINK_STORAGE_KEYS = {
    address: 'deeplink_wallet_address',
    type: 'deeplink_wallet_type',
    session: 'deeplink_wallet_session',
    pendingHandshake: 'deeplink_pending_handshake',
    pendingSave: 'deeplink_wallet_pending_save',
} as const;

// The connect endpoint must be the https universal link (per each wallet's
// docs); the custom-scheme form (phantom://...) can land on the wallet's home
// screen instead of the connect sheet. The redirect_link back to us stays a
// custom scheme so iOS returns to the app instead of the browser.
const WALLET_CONNECT_URL: Record<DeepLinkWalletType, string> = {
    phantom: 'https://phantom.app/ul/v1/connect',
    solflare: 'https://solflare.com/ul/v1/connect',
    backpack: 'https://backpack.app/ul/v1/connect',
};

const CONNECT_TIMEOUT_MS = 60_000;
const CANCELLATION_DETECTION_DELAY_MS = 15_000;
const PENDING_HANDSHAKE_TTL_MS = 5 * 60_000;

interface CurrentAttempt {
    attemptId: string;
    keyPair: nacl.BoxKeyPair;
    walletType: DeepLinkWalletType;
    resolve: (result: DeepLinkConnection) => void;
    reject: (reason: any) => void;
    timeoutId: ReturnType<typeof setTimeout>;
    cancelTimerId: ReturnType<typeof setTimeout> | null;
    appStateSub: NativeEventSubscription | null;
    openedWalletAt: number;
}

let currentAttempt: CurrentAttempt | null = null;

const walletLabel = (walletType: string | null | undefined) =>
    `${walletType ? walletType.charAt(0).toUpperCase() + walletType.slice(1) : 'Deep Link'} Wallet`;

const cleanupAttempt = (attempt: CurrentAttempt) => {
    clearTimeout(attempt.timeoutId);
    if (attempt.cancelTimerId) clearTimeout(attempt.cancelTimerId);
    attempt.appStateSub?.remove();
    if (currentAttempt?.attemptId === attempt.attemptId) {
        currentAttempt = null;
    }
};

const failAttempt = (attempt: CurrentAttempt, error: any) => {
    cleanupAttempt(attempt);
    walletLogger.error(WalletTag.MWA_IOS, `Deep link attempt failed for ${attempt.walletType}`, error);
    attempt.reject(error);
};

const resolveAttempt = (attempt: CurrentAttempt, result: DeepLinkConnection) => {
    cleanupAttempt(attempt);
    walletLogger.info(WalletTag.MWA_IOS, `Deep link attempt resolved for ${attempt.walletType}`, {
        address: result.address,
    });
    attempt.resolve(result);
};

const clearPendingHandshake = async () => {
    try {
        await storage.removeItem(DEEPLINK_STORAGE_KEYS.pendingHandshake);
    } catch { }
};

interface PendingHandshakeRecord {
    secretKeyB58: string;
    publicKeyB58: string;
    walletType: DeepLinkWalletType;
    attemptId: string;
    createdAt: number;
}

const loadPendingHandshake = async (): Promise<PendingHandshakeRecord | null> => {
    try {
        const raw = await storage.getItem(DEEPLINK_STORAGE_KEYS.pendingHandshake);
        if (!raw) return null;
        const record = JSON.parse(raw) as PendingHandshakeRecord;
        if (!record?.secretKeyB58 || !record?.createdAt) {
            await clearPendingHandshake();
            return null;
        }
        if (Date.now() - record.createdAt > PENDING_HANDSHAKE_TTL_MS) {
            walletLogger.warn(WalletTag.MWA_IOS, 'Discarding expired pending handshake record');
            await clearPendingHandshake();
            return null;
        }
        return record;
    } catch (e) {
        walletLogger.warn(WalletTag.MWA_IOS, 'Failed to load pending handshake record', e);
        await clearPendingHandshake();
        return null;
    }
};

const persistConnectedWallet = async (
    address: string,
    walletType: string,
    session: string | null,
    walletPubKeyB58: string,
    dappSecretKey: Uint8Array,
) => {
    await storage.setItem(DEEPLINK_STORAGE_KEYS.address, address);
    await storage.setItem(DEEPLINK_STORAGE_KEYS.type, walletType);
    if (session) {
        // Groundwork for future deep-link signing; Keychain-backed like the rest.
        await storage.setItem(DEEPLINK_STORAGE_KEYS.session, JSON.stringify({
            session,
            walletPubKeyB58,
            dappSecretKeyB58: bs58.encode(dappSecretKey),
            walletType,
        }));
    }
};

/**
 * Saves the connected address to the backend when the service itself drives
 * completion (cold start), or when retrying a save that previously failed.
 * Idempotent: the backend treats a same-address save as a no-op success.
 */
const completeBackendSave = async (address: string): Promise<void> => {
    try {
        await saveWallet(address);
        await storage.removeItem(DEEPLINK_STORAGE_KEYS.pendingSave);
        walletLogger.info(WalletTag.MWA_IOS, `Cold-start/retry saveWallet succeeded for ${address}`);
        DeviceEventEmitter.emit(WALLET_DEEPLINK_EVENTS.connected, { address });
    } catch (err: any) {
        const serverError = String(err?.response?.data?.error || '');
        if (serverError.includes('another account')) {
            // The address belongs to someone else — roll the local link back.
            walletLogger.warn(WalletTag.MWA_IOS, `saveWallet rejected (${serverError}); rolling back local wallet state`);
            await storage.removeItem(DEEPLINK_STORAGE_KEYS.address);
            await storage.removeItem(DEEPLINK_STORAGE_KEYS.type);
            await storage.removeItem(DEEPLINK_STORAGE_KEYS.session);
            await storage.removeItem(DEEPLINK_STORAGE_KEYS.pendingSave);
            DeviceEventEmitter.emit(WALLET_DEEPLINK_EVENTS.disconnected);
            return;
        }
        // No/expired token or transient failure — keep the local link and retry
        // from the next wallet screen mount.
        walletLogger.warn(WalletTag.MWA_IOS, `saveWallet failed (${err?.message}); flagging pending save`, err);
        await storage.setItem(DEEPLINK_STORAGE_KEYS.pendingSave, '1');
        DeviceEventEmitter.emit(WALLET_DEEPLINK_EVENTS.connected, { address });
    }
};

/** Retry a backend save that failed earlier (e.g. redirect landed while logged out). */
export const retryPendingWalletSave = async (): Promise<void> => {
    try {
        const flag = await storage.getItem(DEEPLINK_STORAGE_KEYS.pendingSave);
        if (flag !== '1') return;
        const address = await storage.getItem(DEEPLINK_STORAGE_KEYS.address);
        if (!address) {
            await storage.removeItem(DEEPLINK_STORAGE_KEYS.pendingSave);
            return;
        }
        await completeBackendSave(address);
    } catch (e) {
        walletLogger.warn(WalletTag.MWA_IOS, 'retryPendingWalletSave failed', e);
    }
};

const handleRedirectUrl = async (url: string): Promise<void> => {
    let parsed: Linking.ParsedURL;
    try {
        parsed = Linking.parse(url);
    } catch {
        return;
    }
    // Only wallet-redirect callbacks belong to this service — unrelated deep
    // links (push taps, profile links, LazorKit) must not touch the handshake.
    const target = `${parsed.hostname || ''}/${parsed.path || ''}`;
    if (!target.includes('wallet-redirect')) return;

    walletLogger.info(WalletTag.MWA_IOS, 'Handling wallet-redirect deep link', { url });

    const attempt = currentAttempt;
    let secretKey: Uint8Array | null = attempt ? attempt.keyPair.secretKey : null;
    let walletType: string | null = attempt ? attempt.walletType : null;

    if (!secretKey) {
        const pending = await loadPendingHandshake();
        if (pending) {
            secretKey = bs58.decode(pending.secretKeyB58);
            walletType = pending.walletType;
            walletLogger.info(WalletTag.MWA_IOS, 'Recovered handshake key material from persisted record (cold start)');
        }
    }
    if (!secretKey) {
        walletLogger.warn(WalletTag.MWA_IOS, 'wallet-redirect received but no key material available; ignoring', { url });
        return;
    }

    const params = parsed.queryParams || {};

    const fail = async (error: Error) => {
        await clearPendingHandshake();
        if (attempt) {
            failAttempt(attempt, error);
        } else {
            walletLogger.error(WalletTag.MWA_IOS, 'Cold-start wallet redirect failed', error);
        }
    };

    const errorCode = params.errorCode || params.error;
    if (errorCode) {
        const errorMessage = params.errorMessage || params.message;
        await fail(new Error(String(errorMessage || errorCode)));
        return;
    }

    // Param name differs per wallet (phantom_/solflare_/..._encryption_public_key);
    // match generically and log which one arrived.
    const pubKeyEntry = Object.entries(params).find(
        ([key]) => key === 'encryption_public_key' || key.endsWith('_encryption_public_key')
    );
    const walletPubKey = pubKeyEntry?.[1];
    const data = params.data;
    const nonce = params.nonce;

    if (!walletPubKey || !data || !nonce) {
        const missing = [
            !walletPubKey && 'encryption_public_key',
            !data && 'data',
            !nonce && 'nonce',
        ].filter(Boolean).join(', ');
        await fail(new Error(`Wallet response is missing expected parameters (${missing}). Please try again.`));
        return;
    }

    walletLogger.debug(WalletTag.MWA_IOS, `Wallet pubkey param matched: ${pubKeyEntry?.[0]}`);

    try {
        const sharedSecret = nacl.box.before(bs58.decode(String(walletPubKey)), secretKey);
        const decrypted = nacl.box.open.after(
            bs58.decode(String(data)),
            bs58.decode(String(nonce)),
            sharedSecret
        );
        if (!decrypted) {
            throw new Error('Failed to decrypt wallet response (nacl.box.open returned null)');
        }
        const payload = JSON.parse(Buffer.from(decrypted).toString('utf-8'));
        if (!payload.public_key) {
            throw new Error('No public key found in decrypted wallet payload');
        }

        const address = String(payload.public_key);
        const resolvedType = (walletType || 'phantom') as DeepLinkWalletType;
        await persistConnectedWallet(address, resolvedType, payload.session ?? null, String(walletPubKey), secretKey);
        await clearPendingHandshake();

        if (attempt) {
            resolveAttempt(attempt, { address, walletType: resolvedType, label: walletLabel(resolvedType) });
            DeviceEventEmitter.emit(WALLET_DEEPLINK_EVENTS.connected, { address, walletType: resolvedType });
        } else {
            // Cold start: no screen is driving the flow — finish it here.
            walletLogger.info(WalletTag.MWA_IOS, `Cold-start handshake decrypted for ${address}; saving to backend`);
            await completeBackendSave(address);
        }
    } catch (e) {
        await fail(e instanceof Error ? e : new Error(String(e)));
    }
};

/** Start a connection attempt: opens the wallet app and resolves on redirect. */
export const beginConnect = (walletType: DeepLinkWalletType): Promise<DeepLinkConnection> => {
    if (currentAttempt) {
        failAttempt(currentAttempt, new Error('Superseded by a new connection attempt'));
    }

    const keyPair = nacl.box.keyPair();
    const attemptId = `${Date.now()}-${walletType}`;

    return new Promise<DeepLinkConnection>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            if (currentAttempt?.attemptId === attemptId && currentAttempt) {
                failAttempt(currentAttempt, new Error(
                    `Connection to ${walletType} timed out after 60s. Please ensure the app is installed and try again.`
                ));
                clearPendingHandshake();
            }
        }, CONNECT_TIMEOUT_MS);

        const attempt: CurrentAttempt = {
            attemptId, keyPair, walletType, resolve, reject, timeoutId,
            cancelTimerId: null, appStateSub: null, openedWalletAt: 0,
        };

        // Returning to the app without a redirect (user cancelled / backed out
        // of the wallet) should fail fast, not spin for the full 60s.
        attempt.appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
            if (state !== 'active') return;
            if (attempt.openedWalletAt === 0) return;
            if (currentAttempt?.attemptId !== attemptId) return;
            if (attempt.cancelTimerId) clearTimeout(attempt.cancelTimerId);
            attempt.cancelTimerId = setTimeout(() => {
                if (currentAttempt?.attemptId === attemptId) {
                    failAttempt(attempt, new Error('Connection cancelled — no response from the wallet.'));
                    clearPendingHandshake();
                }
            }, CANCELLATION_DETECTION_DELAY_MS);
        });

        currentAttempt = attempt;

        (async () => {
            try {
                await storage.setItem(DEEPLINK_STORAGE_KEYS.pendingHandshake, JSON.stringify({
                    secretKeyB58: bs58.encode(keyPair.secretKey),
                    publicKeyB58: bs58.encode(keyPair.publicKey),
                    walletType,
                    attemptId,
                    createdAt: Date.now(),
                } satisfies PendingHandshakeRecord));

                const redirectLink = Linking.createURL('wallet-redirect');
                const query = qs.stringify({
                    app_url: 'https://nextvibe.io',
                    dapp_encryption_public_key: bs58.encode(keyPair.publicKey),
                    redirect_link: redirectLink,
                    cluster: 'mainnet-beta',
                });
                const url = `${WALLET_CONNECT_URL[walletType]}?${query}`;
                walletLogger.info(WalletTag.MWA_IOS, `Opening ${walletType} connect universal link`, { redirectLink });
                await Linking.openURL(url);
                attempt.openedWalletAt = Date.now();
            } catch (err) {
                if (currentAttempt?.attemptId === attemptId) {
                    failAttempt(attempt, err);
                }
                clearPendingHandshake();
            }
        })();
    });
};

/** Clears every local trace of the deep-link wallet. */
export const disconnectDeepLinkWallet = async (): Promise<void> => {
    walletLogger.info(WalletTag.MWA_IOS, 'Disconnecting deep link wallet & clearing local storage');
    for (const key of Object.values(DEEPLINK_STORAGE_KEYS)) {
        try {
            await storage.removeItem(key);
        } catch { }
    }
    DeviceEventEmitter.emit(WALLET_DEEPLINK_EVENTS.disconnected);
};

/**
 * Finish a handshake whose redirect cold-started the app. Safe to call every
 * launch: it only acts when the launch URL is a wallet-redirect AND a fresh
 * persisted handshake exists (handling consumes the record, so a stale launch
 * URL can never be re-processed).
 */
export const completeColdStartHandshake = async (): Promise<void> => {
    if (Platform.OS !== 'ios') return;
    try {
        const initialUrl = await Linking.getInitialURL();
        if (!initialUrl || !initialUrl.includes('wallet-redirect')) return;
        if (currentAttempt) return; // a live attempt handles it via the listener
        const pending = await loadPendingHandshake();
        if (!pending) return;
        walletLogger.info(WalletTag.MWA_IOS, 'Cold-start wallet redirect detected; completing handshake');
        await handleRedirectUrl(initialUrl);
    } catch (e) {
        walletLogger.warn(WalletTag.MWA_IOS, 'completeColdStartHandshake failed', e);
    }
};

// Single, filtered redirect listener for the whole app.
if (Platform.OS === 'ios') {
    Linking.addEventListener('url', ({ url }) => {
        handleRedirectUrl(url).catch((e) => {
            walletLogger.error(WalletTag.MWA_IOS, 'Unhandled error in wallet redirect handler', e);
        });
    });
}
