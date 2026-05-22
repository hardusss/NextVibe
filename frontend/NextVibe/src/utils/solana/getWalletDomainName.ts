import * as Device from 'expo-device';
import { Connection, PublicKey } from '@solana/web3.js';
import { TldParser } from '@onsol/tldparser';

/**
 * Attempts to resolve a human-readable domain name for a given Solana public key.
 * Uses @onsol/tldparser to fetch all supported domains, prioritizing .skr and .sol.
 * 
 * @param {string} pubkeyBase58 - The Base58 encoded Solana public key.
 * @param {Connection} connection - A valid Solana web3 connection instance.
 * @returns {Promise<string>} The resolved domain name or a generated fallback username.
 */
export async function generateUsername(
    pubkeyBase58: string, 
    connection: Connection
): Promise<string> {
    try {
        const parser = new TldParser(connection);
        const pubkey = new PublicKey(pubkeyBase58);

        // Fetch all domains associated with the public key 
        // (This includes AllDomains like .skr, .abc, and Bonfida .sol)
        const domains = await parser.getAllUserDomains(pubkey);

        if (domains && domains.length > 0) {
            console.log('✅ Domains resolved via tldparser:', domains);
            
            // Prioritize .skr, then .sol, then fallback to the first available domain
            const skrDomain = domains.find(d => d.toLowerCase().endsWith('.skr'));
            if (skrDomain) return skrDomain;

            const solDomain = domains.find(d => d.toLowerCase().endsWith('.sol'));
            if (solDomain) return solDomain;

            return domains[0];
        }
    } catch (error) {
        console.warn('⚠️ Domain resolution failed:', error);
    }

    // Fallback generation based on device model if no domains found or error occurred
    const shortKey = pubkeyBase58.slice(0, 6);
    const baseName = `vibe_${shortKey}`;
    const modelName = (Device.modelName ?? '').toLowerCase();
    
    // Check if the device is a Solana Mobile (Seeker or Saga)
    const isSeeker = modelName.includes('seeker') || modelName.includes('saga');
    console.log('📱 Fallback strategy utilized. isSeekerDevice:', isSeeker);
    
    return isSeeker ? `${baseName}.skr` : `${baseName}.nxv`;
}