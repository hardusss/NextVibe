import React from 'react';
// @ts-ignore
import { MobileWalletProvider } from '@wallet-ui/react-native-web3js/dist/index.native.mjs';

interface MobileWalletProviderGateProps {
    children: React.ReactNode;
    chain: string;
    endpoint: string;
    identity: {
        name: string;
        uri?: string;
        icon?: string;
    };
}

export default function MobileWalletProviderGate({
    children,
    chain,
    endpoint,
    identity,
}: MobileWalletProviderGateProps) {
    return (
        <MobileWalletProvider chain={chain} endpoint={endpoint} identity={identity}>
            {children}
        </MobileWalletProvider>
    );
}
