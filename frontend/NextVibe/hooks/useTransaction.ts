import { useState } from "react";
import useWalletAddress from "./useWalletAddress";
import SolanaService from "@/src/services/SolanaService";
import { TOKENS } from "@/constants/Tokens";
import {
    PublicKey,
    Transaction,
    TransactionInstruction,
} from "@solana/web3.js";

export default function useTransaction() {
    const wallet = useWalletAddress();

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
                token.mint
            );

            let txSignature: string | void;

            if (wallet.walletType === 'lazorkit') {
                const signWithLazor = wallet.signAndSendTransaction as (payload: any, options: any) => Promise<string>;
                txSignature = await signWithLazor(
                    {
                        instructions,
                        transactionOptions: { feeToken: 'SOL', clusterSimulation: "devnet" }
                    },
                    { redirectUrl: `nextvibe://${redirectPage ? redirectPage : "transaction"}` },
                );
            } else if (wallet.walletType === 'mwa') {
                const { blockhash } = await wallet.connection.getLatestBlockhash();
                const transaction = new Transaction().add(...instructions);
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = new PublicKey(wallet.address);
                const signWithMWA = wallet.signAndSendTransaction as (tx: Transaction) => Promise<string>;
                txSignature = await signWithMWA(transaction);
            } else {
                throw new Error("Unsupported wallet type.");
            }

            if (txSignature) setSignature(txSignature);
            return txSignature;

        } catch (err: any) {
            console.error("Transaction failed:", err);
            const message = err instanceof Error ? err.message : "Transaction failed";
            setError(message);
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
                const signWithLazor = wallet.signAndSendTransaction as (payload: any, options: any) => Promise<string>;
                txSignature = await signWithLazor(
                    {
                        instructions,
                        transactionOptions: { feeToken: 'SOL', clusterSimulation: "devnet" }
                    },
                    { redirectUrl: `nextvibe://${redirectPage ? redirectPage : "transaction"}` },
                );
            } else if (wallet.walletType === 'mwa') {
                const { blockhash } = await wallet.connection.getLatestBlockhash();
                const transaction = new Transaction().add(...instructions);
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = new PublicKey(wallet.address);
                const signWithMWA = wallet.signAndSendTransaction as (tx: Transaction) => Promise<string>;
                txSignature = await signWithMWA(transaction);
            } else {
                throw new Error("Unsupported wallet type.");
            }

            setSignature(txSignature);
            return txSignature;

        } catch (err: any) {
            console.error("sendInstructions failed:", err);
            const message = err instanceof Error ? err.message : "Transaction failed";
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    return {
        sendTransaction,
        sendInstructions,
        signature,
        isLoading,
        error,
    };
}