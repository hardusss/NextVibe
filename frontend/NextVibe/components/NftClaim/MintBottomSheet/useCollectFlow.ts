import { useCallback, useState } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";

import useWalletAddress from "@/hooks/useWalletAddress";
import { collectPrepare, collectSubmit, CollectApiError } from "@/src/api/collect";
import mintNFT from "@/src/api/mint.nft";
import { walletLogger, WalletTag } from "@/src/utils/walletLogger";

export type CollectStatus = "idle" | "preparing" | "signing" | "minting" | "success" | "error";

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

/** MWA sheets throw when the user closes the sign prompt — that's not an error state. */
const isUserCancellation = (e: any) =>
    /cancel|declin|reject|dismiss/i.test(String(e?.message ?? ""));

/**
 * The prepare → sign → submit state machine for the free collect flow.
 *
 * - Owner: publishes their own edition via the backend-paid mint (no prompt).
 * - Collector with MWA: signs the prepared transaction in their wallet
 *   (sign only — the backend broadcasts). One silent re-prepare on expiry.
 * - Collector without MWA (LazorKit / passkey): fully backend-signed mint.
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

    const mwaAttempt = useCallback(async (): Promise<CollectResult> => {
        setStatus("preparing");
        walletLogger.info(WalletTag.COLLECT, "prepare: requesting transaction", { postId });
        const prep = await collectPrepare(postId, "mwa");
        walletLogger.info(WalletTag.COLLECT, "prepare: transaction ready", {
            postId,
            claimId: prep.claimId,
            edition: prep.edition,
            totalSupply: prep.totalSupply,
            expiresAt: prep.expiresAt,
            memo: prep.memo,
        });

        setStatus("signing");
        const tx = VersionedTransaction.deserialize(
            new Uint8Array(Buffer.from(prep.transaction!, "base64"))
        );
        if (wallet.walletType !== "mwa") {
            throw new CollectApiError("Wallet not connected.", "WALLET_REQUIRED");
        }
        walletLogger.info(WalletTag.COLLECT, "signing: opening wallet prompt", { postId, claimId: prep.claimId });
        const signed = await wallet.signTransaction(tx);
        walletLogger.info(WalletTag.COLLECT, "signing: user signed", { postId, claimId: prep.claimId });

        setStatus("minting");
        const res = await collectSubmit(
            prep.claimId!,
            Buffer.from(signed.serialize()).toString("base64")
        );
        walletLogger.info(WalletTag.COLLECT, "submit: mint confirmed", {
            postId,
            edition: res.edition,
            assetId: res.assetId,
        });
        return {
            edition: res.edition,
            totalSupply: prep.totalSupply,
            assetId: res.assetId,
            signature: res.signature,
        };
    }, [postId, wallet]);

    const run = useCallback(async (): Promise<CollectOutcome> => {
        setError(null);
        walletLogger.info(WalletTag.COLLECT, "flow: started", {
            postId, isOwner, walletType: wallet.walletType,
        });
        try {
            let r: CollectResult;

            if (isOwner) {
                setStatus("minting");
                walletLogger.info(WalletTag.COLLECT, "publish: owner mint via backend", { postId });
                const res = await mintNFT(wallet.address ?? "", postId);
                if (!res?.success) {
                    throw new CollectApiError(res?.error || "Publish failed", res?.code || "PUBLISH_FAILED");
                }
                r = {
                    edition: res.edition,
                    totalSupply: res.totalSupply ?? 50,
                    assetId: res.assetId,
                    signature: res.signature,
                };
            } else if (wallet.walletType === "mwa") {
                try {
                    r = await mwaAttempt();
                } catch (e: any) {
                    // Blockhash lifetime is short; re-prepare once silently.
                    if (e instanceof CollectApiError && e.code === "CLAIM_EXPIRED") {
                        walletLogger.warn(WalletTag.COLLECT, "flow: claim expired, retrying once", { postId });
                        r = await mwaAttempt();
                    } else {
                        throw e;
                    }
                }
            } else {
                setStatus("minting");
                walletLogger.info(WalletTag.COLLECT, "flow: no MWA, backend-signed mint", {
                    postId, walletType: wallet.walletType,
                });
                const res = await collectPrepare(postId, "none");
                r = {
                    edition: res.edition,
                    totalSupply: res.totalSupply,
                    assetId: res.assetId,
                    signature: res.signature,
                };
            }

            setResult(r);
            setStatus("success");
            walletLogger.info(WalletTag.COLLECT, "flow: success", {
                postId, edition: r.edition, assetId: r.assetId,
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
