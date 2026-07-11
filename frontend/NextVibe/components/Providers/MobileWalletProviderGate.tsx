import React from 'react';

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
}: MobileWalletProviderGateProps) {
    return <>{children}</>;
}
