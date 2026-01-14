import { 
    Connection, 
    PublicKey, 
    LAMPORTS_PER_SOL, 
    SystemProgram,
    TransactionInstruction,
    type SignaturesForAddressOptions,
    type ParsedTransactionWithMeta
} from "@solana/web3.js";
import { 
    TOKEN_PROGRAM_ID, 
    createTransferInstruction, 
    getAssociatedTokenAddress, 
    createAssociatedTokenAccountInstruction,
    ASSOCIATED_TOKEN_PROGRAM_ID 
} from '@solana/spl-token';
import { TOKEN_MINT_CONSTANTS } from "@/constants/Tokens";
import { FormattedTransaction } from "@/src/types/solana"; 
import { formatTransactions } from "@/src/utils/solana/transactionParser" 

/**
 * Facade for Solana blockchain interactions.
 * Handles balances, history parsing, and transfer instruction generation.
 */
export default class SolanaService {

    /**
     * Fetches native SOL balance.
     * @returns Balance in **SOL** (not lamports). Returns `0` on error (safe fallback).
     */
    static async getSolBalance(connection: Connection, walletAddress: string): Promise<number> {
        try {
            const publicKey = new PublicKey(walletAddress);
            const lamports = await connection.getBalance(publicKey);
            return lamports / LAMPORTS_PER_SOL;
        } catch (error) {
            console.warn('[SolanaService] Error fetching SOL:', error);
            return 0;
        }
    }

    /**
     * Fetches USDC balance by filtering token accounts.
     * @returns UI Amount (already adjusted for decimals). Returns `0` if not found.
     */
    static async getUsdcBalance(connection: Connection, walletAddress: string): Promise<number> {
        try {
            const pubkey = new PublicKey(walletAddress);
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
                programId: TOKEN_PROGRAM_ID,
            });
 
            const usdcAccount = tokenAccounts.value.find((item) => 
                item.account.data.parsed.info.mint === TOKEN_MINT_CONSTANTS.USDC_MINT
            );

            return usdcAccount?.account.data.parsed.info.tokenAmount.uiAmount || 0;
        } catch (error) {
            console.warn('[SolanaService] Error fetching USDC:', error);
            return 0;
        }
    }

    /**
     * Fetches parsed history with pagination support.
     * @param lastSignature - Cursor for pagination (fetch transactions older than this signature).
     */
    static async getTransactionsHistory(
        connection: Connection,
        walletAddress: string,
        isLastTransaction: boolean,
        lastSignature?: string
    ): Promise<FormattedTransaction[] | null> {
        try {
            const signaturesOptions: SignaturesForAddressOptions = {
                limit: isLastTransaction ? 1 : 20,
                before: lastSignature // Pagination cursor
            };
            
            const address = new PublicKey(walletAddress);
            const signatures = await connection.getSignaturesForAddress(address, signaturesOptions);

            if (signatures.length === 0) return [];

            const txs = await Promise.all(
                signatures.map(sig =>
                    connection.getParsedTransaction(sig.signature, {
                        maxSupportedTransactionVersion: 0,
                        commitment: "confirmed",
                    })
                )
            );

            const validTxs = txs.filter((tx): tx is ParsedTransactionWithMeta => tx !== null);
            return formatTransactions(walletAddress, validTxs);

        } catch (error) {
            console.error('[SolanaService] Error fetching history:', error);
            return null;
        }
    }

    /**
     * Generates transfer instructions.
     * - **SOL:** Simple SystemProgram transfer.
     * - **SPL:** Automatically creates recipient's ATA if missing (funded by sender).
     * * @param amountRaw - Amount in **atomic units** (Lamports for SOL, integer for Tokens).
     * @param tokenMint - Pass `null` or `"SOL"` for native transfer.
     */
    static async createTransferInstructions(
        connection: Connection,
        senderAddress: string,
        recipientAddress: string,
        amountRaw: number,
        tokenMint?: string | null 
    ): Promise<TransactionInstruction[]> {
        const senderPubkey = new PublicKey(senderAddress);
        const recipientPubkey = new PublicKey(recipientAddress);
        const instructions: TransactionInstruction[] = [];

        const isSolTransfer = !tokenMint || tokenMint === "SOL";

        if (isSolTransfer) {
            instructions.push(
                SystemProgram.transfer({
                    fromPubkey: senderPubkey,
                    toPubkey: recipientPubkey,
                    lamports: BigInt(amountRaw)
                })
            );
        } else {
            const mintPubkey = new PublicKey(tokenMint);
            
            // Resolve ATAs
            const senderATA = await getAssociatedTokenAddress(
                mintPubkey, senderPubkey, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
            );
            const recipientATA = await getAssociatedTokenAddress(
                mintPubkey, recipientPubkey, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
            );

            // Check if Recipient ATA exists, create if not
            const recipientAccountInfo = await connection.getAccountInfo(recipientATA);
            if (!recipientAccountInfo) {
                instructions.push(
                    createAssociatedTokenAccountInstruction(
                        senderPubkey, recipientATA, recipientPubkey, mintPubkey
                    )
                );
            }

            instructions.push(
                createTransferInstruction(
                    senderATA, recipientATA, senderPubkey, BigInt(amountRaw)
                )
            );
        }
        
        return instructions;
    }
}