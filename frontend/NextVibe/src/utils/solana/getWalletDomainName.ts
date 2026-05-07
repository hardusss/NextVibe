import * as Device from 'expo-device';

/**
 * Attempts to resolve a human-readable domain name for a given Solana public key.
 * It checks AllDomains, then Bonfida (SNS), and falls back to a generated generic name.
 * 
 * @param {string} pubkeyBase58 - The Base58 encoded Solana public key.
 * @returns {Promise<string>} The resolved domain name or a generated fallback username.
 */
export async function generateUsername(pubkeyBase58: string): Promise<string> {
    const [allDomainsResult, bonfidaResult] = await Promise.allSettled([
        fetchAllDomains(pubkeyBase58),
        fetchBonfidaDomain(pubkeyBase58),
    ]);

    if (allDomainsResult.status === 'fulfilled' && allDomainsResult.value) {
        console.log('✅ AllDomains resolved:', allDomainsResult.value);
        return allDomainsResult.value;
    }

    if (bonfidaResult.status === 'fulfilled' && bonfidaResult.value) {
        console.log('✅ Bonfida resolved:', bonfidaResult.value);
        return bonfidaResult.value;
    }

    // Fallback generation based on device model
    const shortKey = pubkeyBase58.slice(0, 6);
    const baseName = `vibe_${shortKey}`;
    const modelName = (Device.modelName ?? '').toLowerCase();
    
    // Check if the device is a Solana Mobile (Seeker or Saga)
    const isSeeker = modelName.includes('seeker') || modelName.includes('saga');
    console.log('📱 Fallback strategy utilized. isSeekerDevice:', isSeeker);
    
    return isSeeker ? `${baseName}.skr` : `${baseName}.nxv`;
}

/**
 * Fetches domains associated with the public key from the AllDomains API.
 * Prioritizes the '.skr' Top Level Domain if multiple domains are found.
 * 
 * @param {string} pubkey - The Base58 encoded Solana public key.
 * @returns {Promise<string | null>} The primary domain with its TLD, or null if none exist.
 */
async function fetchAllDomains(pubkey: string): Promise<string | null> {
    try {
        const res = await fetch(
            `https://api.alldomains.id/v1/user/${pubkey}/domains`,
            { headers: { Accept: 'application/json' } }
        );
        
        if (!res.ok) return null;

        const data = await res.json();
        const list: Array<{ domain: string; tld: string }> = data?.result ?? data?.data ?? [];
        
        if (!list.length) return null;

        const skrDomain = list.find(d => d.tld === '.skr');
        const primaryDomain = skrDomain ?? list[0];
        
        return `${primaryDomain.domain}${primaryDomain.tld}`;
    } catch (error) {
        console.warn('⚠️ AllDomains fetch failed:', error);
        return null;
    }
}

/**
 * Performs a reverse lookup using the Bonfida Solana Name Service proxy.
 * 
 * @param {string} pubkey - The Base58 encoded Solana public key.
 * @returns {Promise<string | null>} The resolved .sol domain, or null if unassigned.
 */
async function fetchBonfidaDomain(pubkey: string): Promise<string | null> {
    try {
        const res = await fetch(
            `https://sns-sdk-proxy.bonfida.workers.dev/reverse-lookup/${pubkey}`
        );
        
        if (!res.ok) return null;

        const data = await res.json();
        
        if (data.s === 'ok' && typeof data.result === 'string' && data.result) {
            return `${data.result}.sol`;
        }
        
        return null;
    } catch (error) {
        console.warn('⚠️ Bonfida fetch failed:', error);
        return null;
    }
}