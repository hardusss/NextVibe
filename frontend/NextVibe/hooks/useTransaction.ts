import { useState } from "react";
import { useWallet } from "@lazorkit/wallet-mobile-adapter";
import SolanaService from "@/src/services/SolanaService";
import { TOKENS } from "@/constants/Tokens";
import { PublicKey } from "@solana/web3.js";

/**
 * useTransaction
 *
 * Returns:
 * - sendTransaction(recipient, amount, token) -> Promise<string | void>
 * - signature: string | null
 * - isLoading: boolean
 * - error: string | null
 *
 * Notes:
 * - Errors are handled internally and exposed via `error`
 * - `sendTransaction` does NOT throw by default
 */

export default function useTransaction() {
    const { connection, smartWalletPubkey, signAndSendTransaction } = useWallet();
    
    // === UI States ===
    // signature: Contains the transaction hash after success (useful for Explorer links)
    const [signature, setSignature] = useState<string | null>(null);
    // isLoading: Controls the loading spinner during the signing process
    const [isLoading, setIsLoading] = useState<boolean>(false);
    // error: Stores human-readable error messages for UI display
    const [error, setError] = useState<string | null>(null);

    /**
     * Orchestrates the transfer of assets (SOL or SPL Tokens).
     * * Process:
     * 1. Validates wallet connection and recipient address.
     * 2. Resolves token decimals and converts UI amount to raw units (BigInt).
     * 3. Calls SolanaService to generate on-chain instructions (SystemProgram or SPL Token Program).
     * 4. Requests biometric signature via LazorKit adapter.
     * * @param recipientAddress - The base58 public key of the receiver
     * @param amount - The amount in human-readable format (e.g. 1.5 SOL)
     * @param tokenSymbol - Key from TOKENS constant (e.g. 'SOL', 'USDC')
     */
    const sendTransaction = async (
        recipientAddress: string,
        amount: number, 
        tokenSymbol: string
    ) => {
        // Reset states before starting new transaction
        setSignature(null);
        setIsLoading(true);
        setError(null);

        try {
            // --- 1. Wallet Validation ---
            if (!smartWalletPubkey) {
                throw new Error("Wallet not connected. Please sign in.");
            }

            if (recipientAddress === smartWalletPubkey.toString()){
                throw new Error("You cannot send funds to yourself.")
            }
            // --- 2. Recipient Address Validation ---
            // We try to create a PublicKey object to ensure the string is valid base58.
            // If invalid, this throws an error preventing a crash later in the Service.
            try {
                new PublicKey(recipientAddress);
            } catch (e) {
                throw new Error("Invalid recipient address format.");
            }

            // --- 3. Token Resolution ---
            // Safely access TOKENS object using type assertion
            const token = TOKENS[tokenSymbol as keyof typeof TOKENS];
            if (!token) throw new Error("Unknown token selected.");

            // --- 4. Precision Math (Amount Conversion) ---
            // Fallback to 9 decimals (SOL standard) if property is missing.
            // Note: Ensure your TOKENS constant uses 'decimals' property name.
            const decimals = token.decimals || 9; 
            
            // Convert to BigInt to avoid floating point errors (e.g. 0.1 + 0.2 !== 0.3)
            const amountRaw = BigInt(Math.floor(amount * Math.pow(10, decimals)));
            
            if (amountRaw <= BigInt(0)) {
                 throw new Error("Amount must be greater than 0.");
            }

            if (amountRaw > BigInt(Number.MAX_SAFE_INTEGER)) {
                throw new Error("Amount is too large to process safely.");
            }


            // --- 5. Instruction Generation ---
            // Delegate complexity to SolanaService. 
            // It handles ATA creation logic for SPL tokens automatically.
            const instructions = await SolanaService.createTransferInstructions(
                connection,
                smartWalletPubkey.toString(),
                recipientAddress,
                Number(amountRaw), // Convert back to Number if Service expects it (safe for < 2^53)
                token.mint
            );

            // --- 6. Biometric Signing (LazorKit) ---
            const txSignature = await signAndSendTransaction(
                {
                    instructions,
                    transactionOptions: { 
                        feeToken: 'SOL', // Pay gas in SOL
                        clusterSimulation: "devnet" 
                    }
                },
                { redirectUrl: "myapp://transaction" },
            );

            setSignature(txSignature);
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