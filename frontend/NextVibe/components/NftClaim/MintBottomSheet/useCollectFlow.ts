import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";

import useWalletAddress from "@/hooks/useWalletAddress";
import { collectPrepare, collectSubmit, CollectApiError } from "@/src/api/collect";
import mintNFT from "@/src/api/mint.nft";
import { storage } from "@/src/utils/storage";
import { walletLogger, WalletTag } from "@/src/utils/walletLogger";

export type CollectStatus = "idle" | "preparing" | "signing" | "minting" | "success" | "error";

export type CollectSigner = "mwa" | "none";

type WalletType = "mwa" | "lazorkit" | "none";

export interface CollectResult {
    edition: number;
    totalSupply: number;
    assetId?: string;
    signature?: string;
}

export interface CollectError {
    code: string;
    message: string;
    resetsAt?: string;
}

export type CollectOutcome =
    | { kind: "success"; result: CollectResult }
    | { kind: "cancelled" }
    | { kind: "error"; error: CollectError };

/**
 * Mobile Wallet Adapter only exists on Android. iOS wallet state can still
 * report walletType "mwa" (deep-linked wallets), so the signer must be
 * decided by platform first, wallet state second.
 */
export function resolveSigner(walletType: WalletType | null): CollectSigner {
    if (Platform.OS !== "android") return "none"; // iOS: no MWA exists
    return walletType === "mwa" ? "mwa" : "none"; // Android: LazorKit/passkey → none
}

/** MWA sheets throw when the user closes the sign prompt — that's not an error state. */
const isUserCancellation = (e: any) =>
    /cancel|declin|reject|dismiss/i.test(String(e?.message ?? e?.name ?? ""));

const MWA_AUTH_TOKEN_KEY = "mwa_auth_token";

const getCachedMwaAuthToken = (): Promise<string | null> => storage.getItem(MWA_AUTH_TOKEN_KEY);

/**
 * Signs the prepared collect transaction in the user's Android wallet
 * (Seed Vault / Phantom / Solflare) via MWA. authorize() runs inside the
 * same transact session as signTransactions — MWA requires that — and the
 * auth token is cached so repeat collects skip the connect screen.
 * Sign only, never signAndSend: the backend broadcasts.
 */
async function signWithMwa(txBase64: string): Promise<string> {
    const { transact } = await import("@solana-mobile/mobile-wallet-adapter-protocol-web3js");

    const bytes = new Uint8Array(Buffer.from(txBase64, "base64"));
    let tx: Transaction | VersionedTransaction;
    try {
        tx = VersionedTransaction.deserialize(bytes);
    } catch {
        tx = Transaction.from(bytes);
    }

    const cachedToken = await getCachedMwaAuthToken();
    try {
        const signedTx = await transact(async (wallet) => {
            const auth = await wallet.authorize({
                chain: "solana:mainnet",
                identity: { name: "NextVibe", uri: "https://nextvibe.io", icon: "favicon.ico" },
                auth_token: cachedToken ?? undefined,
            });
            if (auth.auth_token) {
                await storage.setItem(MWA_AUTH_TOKEN_KEY, auth.auth_token);
            }
            const [signed] = await wallet.signTransactions({ transactions: [tx] });
            return signed;
        });
        return Buffer.from(signedTx.serialize()).toString("base64");
    } catch (e) {
        // A stale auth token can poison the session — drop it so the next
        // attempt re-authorizes from scratch.
        if (cachedToken) {
            await storage.removeItem(MWA_AUTH_TOKEN_KEY);
        }
        throw e;
    }
}

/**
 * The collect state machine.
 *
 * - Owner: publishes their own edition via the backend-paid mint (no prompt).
 * - signer "mwa" (Android + MWA wallet): prepare → sign in wallet → submit,
 *   with one silent re-prepare on blockhash expiry.
 * - signer "none" (iOS, LazorKit, passkey): a single prepare call returns
 *   the finalized backend-signed mint — no signing state, no submit.
 */
export function useCollectFlow(postId: number, isOwner: boolean) {
    const wallet = useWalletAddress();
    const [status, setStatus] = useState<CollectStatus>("idle");
    const [error, setError] = useState<CollectError | null>(null);
    const [result, setResult] = useState<CollectResult | null>(null);

    const reset = useCallback(() => {
        setStatus("idle");
        setError(null);
        setResult(null);
    }, []);

    const mwaAttempt = useCallback(async (t_swipe: number): Promise<CollectResult> => {
        walletLogger.info(WalletTag.COLLECT, "prepare: requesting transaction", { postId });
        const prep = await collectPrepare(postId, "mwa");
        const t_prepare_done = Date.now();
        walletLogger.info(WalletTag.COLLECT, "prepare: transaction ready", {
            postId,
            claimId: prep.claimId,
            edition: prep.edition,
            totalSupply: prep.totalSupply,
            expiresAt: prep.expiresAt,
            memo: prep.memo,
        });

        // Show reserved edition from prepare immediately in UI
        setResult((prev) => ({
            edition: prep.edition,
            totalSupply: prep.totalSupply,
            assetId: prev?.assetId,
            signature: prev?.signature,
        }));

        setStatus("signing");
        walletLogger.info(WalletTag.COLLECT, "signing: opening wallet prompt", { postId, claimId: prep.claimId });
        const signedB64 = await signWithMwa(prep.transaction!);
        const t_signed = Date.now();
        walletLogger.info(WalletTag.COLLECT, "signing: user signed", { postId, claimId: prep.claimId });

        setStatus("minting");
        const res = await collectSubmit(prep.claimId!, signedB64);
        const t_submit_done = Date.now();
        walletLogger.info(
            WalletTag.COLLECT,
            `timing: swipe -> done in ${t_submit_done - t_swipe}ms (prepare: ${t_prepare_done - t_swipe}ms, sign: ${t_signed - t_prepare_done}ms, submit: ${t_submit_done - t_signed}ms)`,
            { postId, edition: res.edition, assetId: res.assetId }
        );
        return {
            edition: res.edition,
            totalSupply: prep.totalSupply,
            assetId: res.assetId,
            signature: res.signature,
        };
    }, [postId]);

    const run = useCallback(async (): Promise<CollectOutcome> => {
        const t_swipe = Date.now();
        setError(null);
        // Start the minting animation immediately upon swipe so prepare time is perceived as part of the animation
        setStatus("minting");
        const signer = resolveSigner(wallet.walletType);
        walletLogger.info(WalletTag.COLLECT, "flow: started", {
            postId, isOwner, walletType: wallet.walletType, platform: Platform.OS, signer,
        });
        try {
            let r: CollectResult;

            if (isOwner) {
                walletLogger.info(WalletTag.COLLECT, "publish: owner mint via backend", { postId });
                const res = await mintNFT(wallet.address ?? "", postId);
                const t_done = Date.now();
                if (!res?.success) {
                    throw new CollectApiError(res?.error || "Publish failed", res?.code || "PUBLISH_FAILED");
                }
                r = {
                    edition: res.edition,
                    totalSupply: res.totalSupply ?? 50,
                    assetId: res.assetId,
                    signature: res.signature,
                };
                walletLogger.info(
                    WalletTag.COLLECT,
                    `timing: swipe -> done in ${t_done - t_swipe}ms (publish: ${t_done - t_swipe}ms)`,
                    { postId, edition: r.edition, assetId: r.assetId }
                );
            } else if (signer === "none") {
                // The prepare response is already final on the gasless path — no signing state, no submit.
                walletLogger.info(WalletTag.COLLECT, "flow: gasless backend-signed mint", {
                    postId, platform: Platform.OS, walletType: wallet.walletType,
                });
                const res = await collectPrepare(postId, "none");
                const t_done = Date.now();
                r = {
                    edition: res.edition,
                    totalSupply: res.totalSupply,
                    assetId: res.assetId,
                    signature: res.signature,
                };
                walletLogger.info(
                    WalletTag.COLLECT,
                    `timing: swipe -> done in ${t_done - t_swipe}ms (prepare/mint: ${t_done - t_swipe}ms)`,
                    { postId, edition: r.edition, assetId: r.assetId }
                );
            } else {
                try {
                    r = await mwaAttempt(t_swipe);
                } catch (e: any) {
                    // Blockhash lifetime is short; re-prepare once silently.
                    if (e instanceof CollectApiError && e.code === "CLAIM_EXPIRED") {
                        walletLogger.warn(WalletTag.COLLECT, "flow: claim expired, retrying once", { postId });
                        r = await mwaAttempt(t_swipe);
                    } else {
                        throw e;
                    }
                }
            }

            setResult(r);
            setStatus("success");
            walletLogger.info(WalletTag.COLLECT, "flow: success", {
                postId, edition: r.edition, assetId: r.assetId, signer,
            });
            return { kind: "success", result: r };
        } catch (e: any) {
            if (isUserCancellation(e)) {
                walletLogger.info(WalletTag.COLLECT, "flow: cancelled by user", { postId });
                setStatus("idle");
                return { kind: "cancelled" };
            }
            const collectError: CollectError = {
                code: e instanceof CollectApiError ? e.code : "UNKNOWN",
                message: e?.message ?? "Something went wrong",
                resetsAt: e instanceof CollectApiError ? e.resetsAt : undefined,
            };
            walletLogger.error(WalletTag.COLLECT, "flow: failed", e, {
                postId,
                signer,
                platform: Platform.OS,
                code: collectError.code,
                resetsAt: collectError.resetsAt,
            });
            setError(collectError);
            setStatus("error");
            return { kind: "error", error: collectError };
        }
    }, [isOwner, postId, wallet, mwaAttempt]);

    return { status, error, result, run, reset, walletType: wallet.walletType };
}
