import React, { useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, useColorScheme,
    TouchableOpacity, Animated, StatusBar, Platform
} from 'react-native';
import LottieView from 'lottie-react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft } from 'lucide-react-native';
import usePortfolio from '@/hooks/usePortfolio';
import { TransactionDetailsCard } from './TransactionDetailsCard';

export default function ResultTransaction() {
    const params = useLocalSearchParams();
    const { from, to, amount, tx_url } = params;
    const symbolStr = Array.isArray(params.symbol) ? params.symbol[0] : params.symbol;

    const { data } = usePortfolio();
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();

    const tokenInfo = data.tokens.find(t => t.symbol === symbolStr);
    const icon = tokenInfo?.logoURI;
    const transactionValue = ((Number(amount) * (tokenInfo?.price || 0))).toFixed(2);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(32)).current;

    useFocusEffect(useCallback(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 700, delay: 250, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 8, delay: 250, useNativeDriver: true }),
        ]).start();
    }, []));

    const mainColor = isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.82)';
    const mutedColor = isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.35)';
    const btnBg = isDark ? 'rgba(196,167,255,0.15)' : 'rgba(109,40,217,0.1)';
    const btnBorder = isDark ? 'rgba(196,167,255,0.35)' : 'rgba(109,40,217,0.25)';
    const btnText = isDark ? 'rgba(196,167,255,0.95)' : 'rgba(109,40,217,0.9)';

    return (
        <LinearGradient
            colors={isDark ? ['#0A0410', '#1a0a2e', '#0A0410'] : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff']}
            style={styles.root}
        >
            <StatusBar backgroundColor={isDark ? '#0A0410' : '#fff'} barStyle={isDark ? 'light-content' : 'dark-content'} />

            <View style={styles.container}>
                <View style={styles.content}>
                    {/* Lottie */}
                    <View style={styles.lottieWrap}>
                        <LottieView
                            source={require('@/assets/lottie/success.json')}
                            autoPlay
                            loop={false}
                            style={{ width: '100%', height: '100%' }}
                        />
                    </View>

                    <Animated.View style={{ alignItems: 'center', opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                        <Text style={[styles.title, { color: mainColor }]}>Sent successfully</Text>
                        <Text style={[styles.subtitle, { color: mutedColor }]}>Your funds are on their way</Text>
                    </Animated.View>

                    {/* Details card */}
                    <Animated.View style={{ width: '100%', opacity: fadeAnim, transform: [{ translateY: slideAnim }], marginTop: 24 }}>
                        <TransactionDetailsCard
                            amount={amount as string}
                            symbol={symbolStr as string}
                            icon={icon}
                            usdValue={transactionValue}
                            from={from as string}
                            to={to as string}
                            txUrl={tx_url as string}
                            isDark={isDark}
                        />
                    </Animated.View>
                </View>

                {/* Back button */}
                <TouchableOpacity
                    style={[styles.backBtn, { backgroundColor: btnBg, borderColor: btnBorder }]}
                    onPress={() => router.push('/wallet-dash')}
                    activeOpacity={0.65}
                >
                    <ArrowLeft size={16} color={btnText} strokeWidth={1.8} />
                    <Text style={[styles.backText, { color: btnText }]}>Back to Wallet</Text>
                </TouchableOpacity>
            </View>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    container: { flex: 1, paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: Platform.OS === 'ios' ? 36 : 24, justifyContent: 'space-between' },
    content: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    lottieWrap: { width: 160, height: 160, marginBottom: 8 },

    title: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 22,
        includeFontPadding: false,
        marginBottom: 6,
    },
    subtitle: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        includeFontPadding: false,
        textAlign: 'center',
    },

    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 54,
        borderRadius: 27,
        borderWidth: 1,
        width: '100%',
    },
    backText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 14,
        includeFontPadding: false,
    },
});