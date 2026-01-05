import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TOKEN_CONSTANTS } from "@/constants/Tokens";


export default class SolanaService {
    static async getSolBalance(connection: Connection, walletAddress: string): Promise<number> {
        try {
            const publicKey = new PublicKey(walletAddress);
            const lamports = await connection.getBalance(publicKey);
            const balance = lamports / LAMPORTS_PER_SOL;

            return balance;
        } catch (error: any) {
            console.warn('[SolanaService] Error fetching SOL:', error);
            return 0;
        }
        
    };
    static async getUsdcBalance(connection: Connection, walletAddress: string): Promise<number> {
        try {
            const pubkey = new PublicKey(walletAddress);

            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
                programId: TOKEN_PROGRAM_ID,
            });
 
            const usdcAccount = tokenAccounts.value.find((item) => 
                item.account.data.parsed.info.mint === TOKEN_CONSTANTS.USDC_MINT
            );

            if (usdcAccount) {
                return usdcAccount.account.data.parsed.info.tokenAmount.uiAmount || 0;
            }

            return 0;

        } catch (error) {
            console.warn('[SolanaService] Error fetching USDC:', error);
            return 0;
        }
    }
}