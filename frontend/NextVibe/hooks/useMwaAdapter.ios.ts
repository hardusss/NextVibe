import { useState, useEffect } from 'react';
import nacl from 'tweetnacl';
// @ts-ignore
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import * as Linking from 'expo-linking';
import { Buffer } from 'buffer';
import qs from 'qs';
import { storage } from '@/src/utils/storage';

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
  resolve: (value: MwaAccount | null) => void;
  reject: (reason: any) => void;
} | null = null;

const handleRedirect = (url: string) => {
  const ref = pendingConnectionRef;
  if (!ref) return;
  try {
    const parsed = Linking.parse(url);
    const params = parsed.queryParams || {};
    
    const errorCode = params.errorCode || params.error;
    const errorMessage = params.errorMessage || params.message;
    if (errorCode) {
      ref.reject(new Error(String(errorMessage || errorCode)));
      pendingConnectionRef = null;
      return;
    }
    
    const walletPubKey = params.phantom_encryption_public_key || params.encryption_public_key || params.solflare_encryption_public_key || params.backpack_encryption_public_key;
    const data = params.data;
    const nonce = params.nonce;
    
    if (!walletPubKey || !data || !nonce) {
      return;
    }
    
    const sharedSecret = nacl.box.before(
      bs58.decode(String(walletPubKey)),
      ref.dappKeyPair.secretKey
    );
    
    const decryptedData = nacl.box.open.after(
      bs58.decode(String(data)),
      bs58.decode(String(nonce)),
      sharedSecret
    );
    
    if (!decryptedData) {
      throw new Error("Failed to decrypt wallet response");
    }
    
    const jsonString = Buffer.from(decryptedData).toString('utf-8');
    const payload = JSON.parse(jsonString);
    
    if (payload.public_key) {
      const address = payload.public_key;
      ref.resolve({
        address: address,
        publicKey: new PublicKey(address),
        label: 'Deep Link Wallet'
      });
    } else {
      throw new Error("No public key found in wallet payload");
    }
  } catch (e) {
    ref.reject(e);
  } finally {
    pendingConnectionRef = null;
  }
};

Linking.addEventListener('url', ({ url }) => {
  handleRedirect(url);
});

export function useMwaAdapter(): MwaAdapterResult {
    const [account, setAccount] = useState<MwaAccount | null>(null);

    useEffect(() => {
        const load = async () => {
            const addr = await storage.getItem("deeplink_wallet_address");
            if (addr) {
                setAccount({
                    address: addr,
                    publicKey: new PublicKey(addr),
                    label: 'Deep Link Wallet'
                });
            }
        };
        load();
    }, []);

    const connect = async (walletType: 'phantom' | 'solflare' | 'backpack' = 'phantom'): Promise<MwaAccount | null> => {
        const dappKeyPair = nacl.box.keyPair();
        const dappPublicKeyBase58 = bs58.encode(dappKeyPair.publicKey);

        return new Promise<MwaAccount | null>(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                const ref = pendingConnectionRef;
                if (ref) {
                    ref.reject(new Error("Connection timed out. Please try again."));
                    pendingConnectionRef = null;
                }
            }, 60000);

            pendingConnectionRef = {
                dappKeyPair,
                resolve: (acc) => {
                    clearTimeout(timeoutId);
                    setAccount(acc);
                    resolve(acc);
                },
                reject: (err) => {
                    clearTimeout(timeoutId);
                    reject(err);
                }
            };

            try {
                // Check if there is an initial URL that might be a redirect callback
                const initialUrl = await Linking.getInitialURL();
                if (initialUrl && initialUrl.includes('wallet-redirect')) {
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
                await Linking.openURL(url);
            } catch (err) {
                clearTimeout(timeoutId);
                pendingConnectionRef = null;
                reject(err);
            }
        });
    };

    const disconnect = async () => {
        await storage.removeItem("deeplink_wallet_address");
        await storage.removeItem("deeplink_wallet_type");
        setAccount(null);
    };

    return {
        account,
        connect,
        disconnect
    };
}
