import {
    PublicKey,
    SystemProgram,
    TransactionInstruction,
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";

/** Platform wallet that receives the 5% fee */
const PLATFORM_ADDRESS = new PublicKey(process.env.EXPO_PUBLIC_NEXTVIBE_PUBKEY!);

/**
 * Builds two SOL transfer instructions for NFT mint payment:
 *   - 95% goes to the post owner (creator royalty)
 *   -  5% goes to the NextVibe platform
 *
 * These instructions are passed to `sendInstructions()` from `useTransaction`
 * and signed by the collector's wallet. The resulting signature is then sent
 * to the Elysia mint service which verifies it and mints the cNFT atomically.
 *
 * @param payer         - Collector's wallet address (pays SOL)
 * @param ownerAddress  - Post owner's wallet address (receives 95%)
 * @param priceSOL      - Total price in SOL (e.g. 0.5)
 * @returns Array of two TransactionInstructions ready to sign
 *
 * @example
 * const ixs = buildMintPaymentInstructions(
 *     wallet.address,
 *     "EaKpyd7H...",   // post owner wallet
 *     0.5              // SOL
 * )
 * const sig = await sendInstructions(ixs)
 * // → pass sig to POST /mint so Elysia can verify payment before minting
 */
export function buildMintPaymentInstructions(
    payer: string,
    ownerAddress: string,
    priceSOL: number,
): TransactionInstruction[] {
    const payerPubkey  = new PublicKey(payer);
    const ownerPubkey  = new PublicKey(ownerAddress);
    const totalLamports = Math.floor(priceSOL * LAMPORTS_PER_SOL);

    const ownerLamports    = Math.floor(totalLamports * 0.95);
    const platformLamports = totalLamports - ownerLamports; // remaining = 5%

    const toOwner = SystemProgram.transfer({
        fromPubkey: payerPubkey,
        toPubkey:   ownerPubkey,
        lamports:   ownerLamports,
    });

    const toPlatform = SystemProgram.transfer({
        fromPubkey: payerPubkey,
        toPubkey:   PLATFORM_ADDRESS,
        lamports:   platformLamports,
    });

    return [toOwner, toPlatform];
}