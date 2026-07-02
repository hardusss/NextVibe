import { useState } from "react";
import useWalletAddress from "./useWalletAddress";
import usePaymaster from "./usePaymaster";
import SolanaService from "@/src/services/SolanaService";
import { TOKENS } from "@/constants/Tokens";
import {
    PublicKey,
    Transaction,
    TransactionInstruction,
} from "@solana/web3.js";
import { parsePaymasterError } from "@/src/utils/solana/paymasterErrors";

export default function useTransaction() {
    const wallet = useWalletAddress();
    const {
        isGaslessAvailable,
        sendSponsoredTransaction,
        incrementCount,
        paymasterConnection,
        classifyError,
    } = usePaymaster();

    const [signature, setSignature] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const sendTransaction = async (
        recipientAddress: string,
        amount: number,
        tokenSymbol: string,
        redirectPage?: string 
    ) => {
        setSignature(null);
        setIsLoading(true);
        setError(null);

        try {
            if (wallet.walletType === 'none' || !wallet.address || !wallet.connection) {
                throw new Error("Wallet not connected. Please sign in.");
            }

            if (recipientAddress === wallet.address.toString()) {
                throw new Error("You cannot send funds to yourself.");
            }

            try {
                new PublicKey(recipientAddress);
            } catch (e) {
                throw new Error("Invalid recipient address format.");
            }

            const token = TOKENS[tokenSymbol as keyof typeof TOKENS];
            if (!token) throw new Error("Unknown token selected.");

            const decimals = token.decimals || 9;
            const amountRaw = BigInt(Math.floor(amount * Math.pow(10, decimals)));

            if (amountRaw <= BigInt(0)) throw new Error("Amount must be greater than 0.");
            if (amountRaw > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount is too large to process safely.");

            const instructions = await SolanaService.createTransferInstructions(
                wallet.connection,
                wallet.address.toString(),
                recipientAddress,
                Number(amountRaw),
                token.mint,
                decimals
            );

            let txSignature: string | void;

            if (wallet.walletType === 'lazorkit') {
                // Lazorkit: SDK handles paymaster internally via LazorKitProvider config
                const signWithLazor = wallet.signAndSendTransaction as (payload: any, options: any) => Promise<string>;
                txSignature = await signWithLazor(
                    {
                        instructions,
                        transactionOptions: { feeToken: 'SOL', clusterSimulation: "mainnet" }
                    },
                    { redirectUrl: `nextvibe://${redirectPage ? redirectPage : "transaction"}` },
                );
                // Track gasless usage — Lazorkit uses Kora paymaster under the hood
                await incrementCount();
            } else if (wallet.walletType === 'mwa') {
                txSignature = await executeMwaTransaction(instructions);
            } else {
                throw new Error("Unsupported wallet type.");
            }

            if (txSignature) setSignature(txSignature);
            return txSignature;

        } catch (err: any) {
            console.error("Transaction failed:", err);
            const parsed = classifyError(err);
            setError(parsed.userMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Sends a set of pre-built TransactionInstructions directly to the wallet
     * for signing and broadcasting.
     *
     * No new instructions are constructed — whatever is passed is sent as-is.
     * Useful when the caller already knows exactly what needs to be signed
     * (e.g. NFT mint payment split between creator and platform).
     *
     * @param instructions - Ready-to-sign Solana instructions
     * @returns Transaction signature string
     *
     * @example
     * const ixs = buildMintPaymentInstructions(payerAddress, ownerAddress, platformAddress, priceInLamports)
     * const sig = await sendInstructions(ixs)
     */
    const sendInstructions = async (
        instructions: TransactionInstruction[],
        redirectPage?: string 
    ): Promise<string> => {
        setSignature(null);
        setIsLoading(true);
        setError(null);

        try {
            if (wallet.walletType === 'none' || !wallet.address || !wallet.connection) {
                throw new Error("Wallet not connected. Please sign in.");
            }

            if (!instructions.length) {
                throw new Error("No instructions provided.");
            }

            let txSignature: string;

            if (wallet.walletType === 'lazorkit') {
                // Lazorkit: SDK handles paymaster internally via LazorKitProvider config
                const signWithLazor = wallet.signAndSendTransaction as (payload: any, options: any) => Promise<string>;
                txSignature = await signWithLazor(
                    {
                        instructions,
                        transactionOptions: { feeToken: 'SOL', clusterSimulation: "mainnet" }
                    },
                    { redirectUrl: `nextvibe://${redirectPage ? redirectPage : "transaction"}` },
                );
                // Track gasless usage — Lazorkit uses Kora paymaster under the hood
                await incrementCount();
            } else if (wallet.walletType === 'mwa') {
                txSignature = await executeMwaTransaction(instructions);
            } else {
                throw new Error("Unsupported wallet type.");
            }

            setSignature(txSignature);
            return txSignature;

        } catch (err: any) {
            console.error("sendInstructions failed:", err);
            const parsed = classifyError(err);
            setError(parsed.userMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Executes an MWA transaction using the gasless (partial-sign) flow
     * when available, falling back to the standard user-pays-gas flow
     * when the daily limit is exhausted.
     *
     * Gasless flow:
     *   1. Build tx with instructions (no feePayer set)
     *   2. User signs via signTransaction (partial sign)
     *   3. Send partially-signed tx to Kora Paymaster
     *   4. Kora appends fee payer signature and broadcasts
     *
     * Fallback flow:
     *   1. Build tx with user as feePayer
     *   2. User signs and sends via signAndSendTransaction
     */
    const executeMwaTransaction = async (
        instructions: TransactionInstruction[],
    ): Promise<string> => {
        if (wallet.walletType !== 'mwa' || !wallet.connection || !wallet.address) {
            throw new Error("MWA wallet not connected.");
        }

        const { blockhash } = await wallet.connection.getLatestBlockhash();
        const transaction = new Transaction().add(...instructions);
        transaction.recentBlockhash = blockhash;

        if (isGaslessAvailable) {
            // ── Gasless path: partial sign → Kora broadcasts ─────────
            // Do NOT set feePayer — Kora will assign its own paymaster pubkey
            transaction.feePayer = new PublicKey(wallet.address);

            // signTransaction returns a Transaction with the user's signature
            const signedTx = await wallet.signTransaction(transaction);
            return await sendSponsoredTransaction(signedTx);
        } else {
            // ── Fallback path: user pays gas ─────────────────────────
            transaction.feePayer = new PublicKey(wallet.address);
            const signWithMWA = wallet.signAndSendTransaction as (tx: Transaction) => Promise<string>;
            return await signWithMWA(transaction);
        }
    };

    return {
        sendTransaction,
        sendInstructions,
        signature,
        isLoading,
        error,
        /** Whether gasless transactions are currently available (under daily limit). */
        isGaslessAvailable,
    };
}