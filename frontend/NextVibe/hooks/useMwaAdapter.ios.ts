import { useState, useEffect } from 'react';
import nacl from 'tweetnacl';
// @ts-ignore
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import * as Linking from 'expo-linking';
import { Buffer } from 'buffer';
import qs from 'qs';
import { storage } from '@/src/utils/storage';
import { walletLogger, WalletTag } from '@/src/utils/walletLogger';

export interface MwaAccount {
    address: { toString(): string };
    publicKey: { toBase58(): string };
    label?: string;
}

export interface MwaAdapterResult {
    account: MwaAccount | null;
    connect: (wallet?: 'phantom' | 'solflare' | 'backpack') => Promise<MwaAccount | null>;
    disconnect: () => Promise<void>;
}

let pendingConnectionRef: {
  dappKeyPair: nacl.BoxKeyPair;
  walletType: string;
  resolve: (value: MwaAccount | null) => void;
  reject: (reason: any) => void;
} | null = null;

const handleRedirect = (url: string) => {
  walletLogger.info(WalletTag.MWA_IOS, 'Incoming deep link redirect URL received', { url });

  const ref = pendingConnectionRef;
  if (!ref) {
    walletLogger.warn(WalletTag.MWA_IOS, 'Received redirect URL but no pending connection reference exists', { url });
    return;
  }

  try {
    const parsed = Linking.parse(url);
    const params = parsed.queryParams || {};
    
    walletLogger.debug(WalletTag.MWA_IOS, 'Parsed redirect query params', {
      keys: Object.keys(params),
      walletType: ref.walletType,
    });

    const errorCode = params.errorCode || params.error;
    const errorMessage = params.errorMessage || params.message;
    if (errorCode) {
      const err = new Error(String(errorMessage || errorCode));
      walletLogger.error(WalletTag.MWA_IOS, `Wallet returned error: [${errorCode}] ${errorMessage || 'No error message'}`, err);
      ref.reject(err);
      pendingConnectionRef = null;
      return;
    }
    
    const walletPubKey = params.phantom_encryption_public_key || params.encryption_public_key || params.solflare_encryption_public_key || params.backpack_encryption_public_key;
    const data = params.data;
    const nonce = params.nonce;
    
    if (!walletPubKey || !data || !nonce) {
      const missing = [];
      if (!walletPubKey) missing.push('encryption_public_key');
      if (!data) missing.push('data');
      if (!nonce) missing.push('nonce');
      walletLogger.warn(WalletTag.MWA_IOS, `Redirect URL missing expected crypt payload params: ${missing.join(', ')}`, { params });
      return;
    }
    
    walletLogger.debug(WalletTag.MWA_IOS, 'Deriving shared secret from wallet encryption public key');
    const sharedSecret = nacl.box.before(
      bs58.decode(String(walletPubKey)),
      ref.dappKeyPair.secretKey
    );
    
    walletLogger.debug(WalletTag.MWA_IOS, 'Decrypting payload with TweetNaCl');
    const decryptedData = nacl.box.open.after(
      bs58.decode(String(data)),
      bs58.decode(String(nonce)),
      sharedSecret
    );
    
    if (!decryptedData) {
      const decryptErr = new Error("Failed to decrypt wallet response (nacl.box.open returned null)");
      walletLogger.error(WalletTag.MWA_IOS, 'Decryption failure: shared secret or nonce mismatch', decryptErr);
      throw decryptErr;
    }
    
    const jsonString = Buffer.from(decryptedData).toString('utf-8');
    walletLogger.debug(WalletTag.MWA_IOS, 'Decrypted JSON payload string received', { rawLength: jsonString.length });
    const payload = JSON.parse(jsonString);
    
    if (payload.public_key) {
      const address = payload.public_key;
      walletLogger.info(WalletTag.MWA_IOS, `Successfully connected wallet via deep link! Address: ${address}`, {
        address,
        walletType: ref.walletType,
      });

      ref.resolve({
        address: address,
        publicKey: new PublicKey(address),
        label: `${ref.walletType.charAt(0).toUpperCase() + ref.walletType.slice(1)} Wallet`
      });
    } else {
      const noKeyErr = new Error("No public key found in decrypted wallet payload");
      walletLogger.error(WalletTag.MWA_IOS, 'Payload does not contain public_key field', noKeyErr, { payload });
      throw noKeyErr;
    }
  } catch (e) {
    walletLogger.error(WalletTag.MWA_IOS, 'Error processing wallet redirect callback', e);
    ref.reject(e);
  } finally {
    pendingConnectionRef = null;
  }
};

Linking.addEventListener('url', ({ url }) => {
  walletLogger.debug(WalletTag.MWA_IOS, 'Linking event listener triggered with url', { url });
  handleRedirect(url);
});

export function useMwaAdapter(): MwaAdapterResult {
    const [account, setAccount] = useState<MwaAccount | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const addr = await storage.getItem("deeplink_wallet_address");
                const wType = await storage.getItem("deeplink_wallet_type");
                if (addr) {
                    walletLogger.info(WalletTag.MWA_IOS, `Loaded cached deep link wallet from storage: ${addr}`, {
                        address: addr,
                        walletType: wType,
                    });
                    setAccount({
                        address: addr,
                        publicKey: new PublicKey(addr),
                        label: `${wType ? (wType.charAt(0).toUpperCase() + wType.slice(1)) : 'Deep Link'} Wallet`
                    });
                }
            } catch (storageErr) {
                walletLogger.error(WalletTag.MWA_IOS, 'Failed to read deeplink wallet from storage', storageErr);
            }
        };
        load();
    }, []);

    const connect = async (walletType: 'phantom' | 'solflare' | 'backpack' = 'phantom'): Promise<MwaAccount | null> => {
        walletLogger.info(WalletTag.MWA_IOS, `Initiating connection request to [${walletType}]`);
        const dappKeyPair = nacl.box.keyPair();
        const dappPublicKeyBase58 = bs58.encode(dappKeyPair.publicKey);

        return new Promise<MwaAccount | null>(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                const ref = pendingConnectionRef;
                if (ref) {
                    const timeoutErr = new Error(`Connection to ${walletType} timed out after 60s. Please ensure the app is installed and try again.`);
                    walletLogger.error(WalletTag.MWA_IOS, `Connection to ${walletType} timed out`, timeoutErr);
                    ref.reject(timeoutErr);
                    pendingConnectionRef = null;
                }
            }, 60000);

            pendingConnectionRef = {
                dappKeyPair,
                walletType,
                resolve: (acc) => {
                    clearTimeout(timeoutId);
                    walletLogger.info(WalletTag.MWA_IOS, `Pending connection resolved successfully for ${walletType}`, {
                        address: acc?.address?.toString(),
                    });
                    setAccount(acc);
                    resolve(acc);
                },
                reject: (err) => {
                    clearTimeout(timeoutId);
                    walletLogger.error(WalletTag.MWA_IOS, `Pending connection rejected for ${walletType}`, err);
                    reject(err);
                }
            };

            try {
                // Check if there is an initial URL that might be a redirect callback
                const initialUrl = await Linking.getInitialURL();
                if (initialUrl && initialUrl.includes('wallet-redirect')) {
                    walletLogger.info(WalletTag.MWA_IOS, 'Found pending initial URL on app launch', { initialUrl });
                    handleRedirect(initialUrl);
                    return;
                }

                const redirectLink = Linking.createURL('wallet-redirect');
                const params = {
                    app_url: 'https://nextvibe.io',
                    dapp_encryption_public_key: dappPublicKeyBase58,
                    redirect_link: redirectLink,
                };
                const query = qs.stringify(params);
                
                let scheme = 'phantom';
                if (walletType === 'solflare') scheme = 'solflare';
                if (walletType === 'backpack') scheme = 'backpack';
                
                const url = `${scheme}://ul/v1/connect?${query}`;
                walletLogger.info(WalletTag.MWA_IOS, `Opening deep link scheme: ${scheme}:// with redirect=${redirectLink}`);
                await Linking.openURL(url);
            } catch (err) {
                clearTimeout(timeoutId);
                pendingConnectionRef = null;
                walletLogger.error(WalletTag.MWA_IOS, `Failed to open deep link for ${walletType}`, err);
                reject(err);
            }
        });
    };

    const disconnect = async () => {
        walletLogger.info(WalletTag.MWA_IOS, 'Disconnecting deep link wallet & clearing local storage');
        try {
            await storage.removeItem("deeplink_wallet_address");
            await storage.removeItem("deeplink_wallet_type");
        } catch (e) {
            walletLogger.warn(WalletTag.MWA_IOS, 'Error clearing deeplink keys from storage', e);
        }
        setAccount(null);
    };

    return {
        account,
        connect,
        disconnect
    };
}
