import { TouchableOpacity, Animated, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import useWalletAddress from "@/hooks/useWalletAddress";
import usePortfolio from "@/hooks/usePortfolio";
import { WalletMinimal } from "lucide-react-native";
import { GlassSurface } from '@/components/Shared/GlassSurface';

const ButtonWallet = () => {
    const router = useRouter();
    const scale = useRef(new Animated.Value(1)).current;
    const { data, isLoading } = usePortfolio();
    const { address } = useWalletAddress();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === "dark";

    const handlePressIn = () => {
        Animated.spring(scale, {
            toValue: 0.90,
            useNativeDriver: true,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scale, {
            toValue: 1,
            friction: 4,
            useNativeDriver: true,
        }).start();
        if (address) {
            router.push("/wallet-dash");
        } else {
            router.push("/wallet-select");
        }
    };

    const isConnected = !!address;
    const totalBalance = data?.tokens?.reduce((sum, t) => sum + t.valueUsd, 0) ?? 0;
    const formattedBalance = isConnected
        ? (totalBalance > 0 ? `$${totalBalance.toFixed(2)}` : "Wallet")
        : "Connect";

    return (
        <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
            <TouchableOpacity
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={1}
                style={styles.touchable}
            >
                <GlassSurface
                    style={styles.glass}
                    glassEffectStyle="regular"
                    colorScheme={isDark ? "dark" : "light"}
                    isInteractive
                    tintColor="rgba(168,85,247,0.18)"
                >
                    <View style={styles.content}>
                        <WalletMinimal
                            color={isDark ? "rgba(220,180,255,0.95)" : "#7C3AED"}
                            size={17}
                        />
                        {isConnected && isLoading ? (
                            <View style={styles.skeleton} />
                        ) : (
                            <Text style={[
                                styles.label,
                                { color: isDark ? 'rgba(230,200,255,0.95)' : '#5B21B6' }
                            ]}>
                                {formattedBalance}
                            </Text>
                        )}
                    </View>
                </GlassSurface>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        shadowColor: '#A855F7',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
    },
    touchable: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    glass: {
        height: 42,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 14,
        minWidth: 80,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    label: {
        fontSize: 13,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    skeleton: {
        width: 44,
        height: 12,
        backgroundColor: 'rgba(168,85,247,0.25)',
        borderRadius: 4,
    },
});

export default ButtonWallet;
