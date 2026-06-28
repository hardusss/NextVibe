import React, { forwardRef, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    useColorScheme,
    TouchableOpacity,
    Linking,
} from 'react-native';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { AlertTriangle, ExternalLink, Wallet } from 'lucide-react-native';

/**
 * AccountFundingPrompt
 *
 * Bottom sheet displayed when the Kora Paymaster rejects a transaction
 * because `allow_system_account_creation` is FALSE and the user's
 * wallet has never been initialized on-chain.
 *
 * Guides the user to deposit a tiny amount of SOL (e.g. 0.001) to
 * initialize their account before using gasless transactions.
 */
interface AccountFundingPromptProps {
    walletAddress?: string | null;
}

const AccountFundingPrompt = forwardRef<BottomSheetModal, AccountFundingPromptProps>(
    ({ walletAddress }, ref) => {
        const isDark = useColorScheme() === 'dark';
        const snapPoints = useMemo(() => ['45%'], []);

        const renderBackdrop = useCallback(
            (props: any) => (
                <BottomSheetBackdrop
                    {...props}
                    disappearsOnIndex={-1}
                    appearsOnIndex={0}
                    opacity={0.7}
                />
            ),
            []
        );

        const handleViewOnExplorer = () => {
            if (walletAddress) {
                Linking.openURL(`https://solscan.io/account/${walletAddress}`);
            }
        };

        const bgColor = isDark ? '#0F0820' : '#FFFFFF';
        const textColor = isDark ? '#F9FAFB' : '#111827';
        const mutedColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)';
        const accentBg = isDark ? 'rgba(251, 191, 36, 0.12)' : 'rgba(251, 191, 36, 0.08)';
        const borderColor = isDark ? 'rgba(251, 191, 36, 0.25)' : 'rgba(251, 191, 36, 0.2)';

        return (
            <BottomSheetModal
                ref={ref}
                snapPoints={snapPoints}
                backgroundStyle={{ backgroundColor: bgColor, borderRadius: 28 }}
                handleIndicatorStyle={{
                    backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                    width: 40,
                }}
                backdropComponent={renderBackdrop}
            >
                <BottomSheetView style={styles.content}>
                    {/* Warning icon */}
                    <View style={[styles.iconCircle, { backgroundColor: accentBg, borderColor }]}>
                        <AlertTriangle size={28} color="#FBBF24" strokeWidth={2} />
                    </View>

                    <Text style={[styles.title, { color: textColor }]}>
                        Initialize Your Wallet
                    </Text>

                    <Text style={[styles.body, { color: mutedColor }]}>
                        Your wallet needs a tiny SOL deposit (as little as 0.001 SOL) to be
                        activated on the Solana network. This is a one-time requirement before
                        you can use free gasless transactions.
                    </Text>

                    <View style={[styles.infoCard, { backgroundColor: accentBg, borderColor }]}>
                        <Wallet size={16} color="#FBBF24" strokeWidth={2} />
                        <Text style={[styles.infoText, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                            Send any amount of SOL to your wallet address, then try again.
                        </Text>
                    </View>

                    {walletAddress && (
                        <TouchableOpacity
                            style={styles.explorerButton}
                            onPress={handleViewOnExplorer}
                            activeOpacity={0.7}
                        >
                            <ExternalLink size={14} color={isDark ? '#A78BFA' : '#7C3AED'} />
                            <Text
                                style={[
                                    styles.explorerText,
                                    { color: isDark ? '#A78BFA' : '#7C3AED' },
                                ]}
                            >
                                View wallet on Solscan
                            </Text>
                        </TouchableOpacity>
                    )}
                </BottomSheetView>
            </BottomSheetModal>
        );
    }
);

AccountFundingPrompt.displayName = 'AccountFundingPrompt';
export default AccountFundingPrompt;

const styles = StyleSheet.create({
    content: {
        padding: 24,
        alignItems: 'center',
    },
    iconCircle: {
        width: 64,
        height: 64,
        borderRadius: 20,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 20,
        textAlign: 'center',
        marginBottom: 10,
        includeFontPadding: false,
    },
    body: {
        fontFamily: 'Dank Mono',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 20,
        paddingHorizontal: 8,
        includeFontPadding: false,
    },
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        marginBottom: 16,
        width: '100%',
    },
    infoText: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        flex: 1,
        includeFontPadding: false,
        lineHeight: 19,
    },
    explorerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
    },
    explorerText: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        includeFontPadding: false,
    },
});
