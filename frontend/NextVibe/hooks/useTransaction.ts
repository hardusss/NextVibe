import { useState } from "react";
import useWalletAddress from "./useWalletAddress";
import SolanaService from "@/src/services/SolanaService";
import { TOKENS } from "@/constants/Tokens";
// 1. Add TransactionMessage and VersionedTransaction to your imports
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

export default function useTransaction() {
    // 2. Do not destructure here so TS can perform Discriminated Union narrowing
    const wallet = useWalletAddress();

    const [signature, setSignature] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const sendTransaction = async (
        recipientAddress: string,
        amount: number,
        tokenSymbol: string
    ) => {
        setSignature(null);
        setIsLoading(true);
        setError(null);

        try {
            // 3. Update wallet validation
            if (wallet.walletType === 'none' || !wallet.address || !wallet.connection) {
                throw new Error("Wallet not connected. Please sign in.");
            }

            if (recipientAddress === wallet.address.toString()) {
                throw new Error("You cannot send funds to yourself.")
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

            if (amountRaw <= BigInt(0)) {
                throw new Error("Amount must be greater than 0.");
            }

            if (amountRaw > BigInt(Number.MAX_SAFE_INTEGER)) {
                throw new Error("Amount is too large to process safely.");
            }

            const instructions = await SolanaService.createTransferInstructions(
                wallet.connection,
                wallet.address.toString(),
                recipientAddress,
                Number(amountRaw),
                token.mint
            );

            let txSignature: string | void;

            // --- 4. Branch logic based on Wallet Type ---
            if (wallet.walletType === 'lazorkit') {
                const signWithLazor = wallet.signAndSendTransaction as (payload: any, options: any) => Promise<string>;
                txSignature = await signWithLazor(
                    {
                        instructions: instructions,
                        transactionOptions: {
                            feeToken: 'SOL',
                            clusterSimulation: "devnet"
                        }
                    },
                    { redirectUrl: "nextvibe://transaction" },
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

            if (txSignature) {
                setSignature(txSignature);
            }
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

    return {
        sendTransaction,
        signature,
        isLoading,
        error
    };
};