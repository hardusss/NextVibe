/**
 * Formatted transaction object for display in UI
 * Represents a single SOL or SPL token transfer with human-readable data
 * 
 * @interface FormattedTransaction
 */
export type FormattedTransaction = {
    /** Transaction signature (unique identifier on Solana blockchain) */
    signature: string;
    
    /** Direction of transaction relative to current wallet */
    type: "sent" | "received";
    
    /** Token identifier - "SOL" for native SOL or mint address for SPL tokens */
    token: string;
    
    /** Transaction amount in token's base units (e.g., SOL, not lamports) */
    amount: number;
    
    /** Sender wallet address */
    from: string;
    
    /** Recipient wallet address */
    to: string;
    
    /** Transaction timestamp (null if block time unavailable) */
    time: Date | null;
};
