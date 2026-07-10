import React, { useRef, useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Animated, StatusBar, useColorScheme, Share, Dimensions, ScrollView, Image, Platform
} from 'react-native';
import { GlassSurface } from '@/components/Shared/GlassSurface';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { BlurView } from 'expo-blur';
import { Copy, Share2, Check, AlertCircle } from 'lucide-react-native';
import WalletHeader from '@/components/Wallet/Shared/WalletHeader';

import useWalletAddress from '@/hooks/useWalletAddress';
import { TOKENS } from '@/constants/Tokens';

const { width } = Dimensions.get('window');

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export default function DepositScreen() {
    const isDark = useColorScheme() === 'dark';
    const { address } = useWalletAddress();
    const safeAddress = address?.toString() || 'Loading...';

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;
    const qrScale = useRef(new Animated.Value(0.9)).current;
    const [copied, setCopied] = useState(false);

    const transX = useRef(new Animated.Value(0)).current;
    const transY = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (Platform.OS === 'ios') {
            const createAnim = (val: Animated.Value, toValue: number, duration: number) => {
                return Animated.sequence([
                    Animated.timing(val, {
                        toValue,
                        duration,
                        useNativeDriver: true,
                        isInteraction: false,
                    }),
                    Animated.timing(val, {
                        toValue: 0,
                        duration,
                        useNativeDriver: true,
                        isInteraction: false,
                    })
                ]);
            };

            Animated.loop(
                Animated.parallel([
                    createAnim(transX, 15, 12000),
                    createAnim(transY, 10, 15000)
                ])
            ).start();
        }
    }, []);

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
                toValue: 0,
                tension: 50,
                friction: 8,
                useNativeDriver: true,
            }),
            Animated.spring(qrScale, {
                toValue: 1,
                tension: 40,
                friction: 7,
                useNativeDriver: true,
                delay: 100
            })
        ]).start();
    }, []);

    const handleCopy = async () => {
        if (!address) return;
        await Clipboard.setStringAsync(safeAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleShare = async () => {
        if (!address) return;
        try {
            await Share.share({
                message: safeAddress,
                title: 'My Solana Address'
            });
        } catch (error) {
            console.error(error);
        }
    };

    const supportedTokens = Object.values(TOKENS);

    const mainBg = isDark ? ['#0A0410', '#1a0a2e', '#0d0618', '#0A0410'] as const : ['#FFFFFF', '#ede9fe', '#dbd4fb', '#d7cdf2'] as const;
    const cardBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.7)';
    const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)';
    const textColor = isDark ? '#FFFFFF' : '#1A1A1A';
    const mutedText = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    const accent = isDark ? '#A78BFA' : '#7C3AED';
    const accentBg = isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,58,237,0.1)';

    return (
        <View style={styles.container}>
            <AnimatedLinearGradient
                colors={mainBg}
                locations={[0, 0.3, 0.65, 1]}
                style={[
                    StyleSheet.absoluteFillObject,
                    Platform.OS === 'ios' ? {
                        transform: [
                            { scale: 1.15 },
                            { translateX: transX },
                            { translateY: transY }
                        ]
                    } : null
                ]}
            />
            <StatusBar backgroundColor={mainBg[0]} barStyle={isDark ? "light-content" : "dark-content"} />

            <WalletHeader title="Receive Assets" isDark={isDark} />

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <Animated.View style={[
                    styles.cardWrapper,
                    { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
                ]}>
                    {/* Glass Card */}
                    <View style={[
                        styles.card,
                        Platform.OS === 'ios' && { borderWidth: 0, overflow: 'hidden' },
                        Platform.OS !== 'ios' && { backgroundColor: cardBg, borderColor: cardBorder }
                    ]}>
                        {Platform.OS === 'ios' ? (
                            <GlassSurface
                                style={StyleSheet.absoluteFillObject}
                                glassEffectStyle="regular"
                                colorScheme={isDark ? "dark" : "light"}
                                tintColor={isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.01)"}
                            />
                        ) : (
                            <BlurView intensity={isDark ? 20 : 50} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
                        )}
                        
                        <View style={[Platform.OS === 'ios' && { zIndex: 1, alignItems: 'center', width: '100%' }]}>
                            <Animated.View style={[styles.qrWrapper, { transform: [{ scale: qrScale }] }]}>
                                {/* QR Glow */}
                                <View style={[styles.qrGlow, { shadowColor: accent }]} />
                                
                                <View style={styles.qrInner}>
                                    <QRCode
                                        value={safeAddress}
                                        size={width * 0.55}
                                        color="#000000"
                                        backgroundColor="#FFFFFF"
                                        logo={require('@/assets/images/icon.png')}
                                        logoSize={40}
                                        logoBackgroundColor="#fff"
                                        logoBorderRadius={10}
                                        logoMargin={2}
                                    />
                                </View>
                            </Animated.View>

                            <View style={[styles.warningBadge, { backgroundColor: accentBg, borderColor: isDark ? 'rgba(167,139,250,0.3)' : 'rgba(124,58,237,0.2)' }]}>
                                <AlertCircle size={14} color={accent} strokeWidth={2} />
                                <Text style={[styles.warningText, { color: accent }]}>Send only Solana & SPL tokens</Text>
                            </View>

                            <Text style={[styles.addressLabel, { color: mutedText }]}>Wallet Address</Text>
                            
                            <TouchableOpacity
                                onPress={handleCopy}
                                activeOpacity={0.7}
                                style={[
                                    styles.addressBox,
                                    Platform.OS === 'ios' && { borderWidth: 0 },
                                    Platform.OS !== 'ios' && { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.6)', borderColor: cardBorder }
                                ]}
                            >
                                {Platform.OS === 'ios' && (
                                    <GlassSurface
                                        style={[StyleSheet.absoluteFillObject, { borderRadius: 16 }]}
                                        glassEffectStyle="regular"
                                        colorScheme={isDark ? "dark" : "light"}
                                        tintColor={isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)"}
                                    />
                                )}
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: Platform.OS === 'ios' ? 1 : undefined }}>
                                    <Text style={[styles.addressText, { color: textColor }]} numberOfLines={1} ellipsizeMode="middle">
                                        {safeAddress}
                                    </Text>
                                    <View style={[styles.copyBtn, { backgroundColor: copied ? '#10B981' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') }]}>
                                        {copied ? (
                                            <Check size={16} color="#FFF" strokeWidth={2.5} />
                                        ) : (
                                            <Copy size={16} color={textColor} strokeWidth={2} />
                                        )}
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Animated.View>

                {/* Supported Tokens */}
                <Animated.View style={[styles.tokensSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                    <Text style={[styles.sectionTitle, { color: mutedText }]}>Supported Assets</Text>
                    <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.tokensScroll}
                    >
                        {supportedTokens.map((token) => (
                            <View
                                key={token.symbol}
                                style={[
                                    styles.tokenChip,
                                    Platform.OS === 'ios' && { borderWidth: 0, overflow: 'hidden' },
                                    Platform.OS !== 'ios' && { backgroundColor: cardBg, borderColor: cardBorder }
                                ]}
                            >
                                {Platform.OS === 'ios' && (
                                    <GlassSurface
                                        style={StyleSheet.absoluteFillObject}
                                        glassEffectStyle="regular"
                                        colorScheme={isDark ? "dark" : "light"}
                                        tintColor={isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.01)"}
                                    />
                                )}
                                <View style={{ flexDirection: 'row', alignItems: 'center', zIndex: Platform.OS === 'ios' ? 1 : undefined }}>
                                    <Image source={{ uri: token.logoURL }} style={styles.tokenIcon} />
                                    <Text style={[styles.tokenSymbol, { color: textColor }]}>{token.symbol}</Text>
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                </Animated.View>
            </ScrollView>

            {/* Bottom Actions */}
            <Animated.View style={[styles.bottomBar, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                <TouchableOpacity
                    onPress={handleShare}
                    activeOpacity={0.8}
                    style={styles.shareBtnWrapper}
                >
                    <LinearGradient
                        colors={['#8B5CF6', '#6D28D9']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.shareBtn}
                    >
                        <Share2 size={20} color="#FFF" strokeWidth={2.5} />
                        <Text style={styles.shareBtnText}>Share Address</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 140,
        alignItems: 'center',
    },
    cardWrapper: {
        width: '100%',
        maxWidth: 400,
        marginBottom: 30,
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 25,
        elevation: 10,
    },
    card: {
        width: '100%',
        borderRadius: 32,
        padding: 24,
        borderWidth: 1,
        alignItems: 'center',
        overflow: 'hidden',
    },
    qrWrapper: {
        position: 'relative',
        marginBottom: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    qrGlow: {
        position: 'absolute',
        width: width * 0.5,
        height: width * 0.5,
        borderRadius: width * 0.25,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 30,
        elevation: 10,
    },
    qrInner: {
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
    },
    warningBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        marginBottom: 24,
        gap: 8,
    },
    warningText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 12,
        includeFontPadding: false,
    },
    addressLabel: {
        fontFamily: 'Dank Mono',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
        alignSelf: 'flex-start',
        marginLeft: 8,
        includeFontPadding: false,
    },
    addressBox: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        padding: 8,
        paddingLeft: 20,
        borderRadius: 20,
        borderWidth: 1,
        gap: 12,
    },
    addressText: {
        flex: 1,
        fontFamily: 'Dank Mono',
        fontSize: 15,
        opacity: 0.9,
        includeFontPadding: false,
    },
    copyBtn: {
        width: 40,
        height: 40,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tokensSection: {
        width: '100%',
        marginBottom: 20,
    },
    sectionTitle: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 14,
        marginBottom: 12,
        marginLeft: 8,
        includeFontPadding: false,
    },
    tokensScroll: {
        paddingHorizontal: 4,
        gap: 10,
    },
    tokenChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 16,
        borderWidth: 1,
        gap: 8,
    },
    tokenIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    tokenSymbol: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 13,
        includeFontPadding: false,
    },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 36,
    },
    shareBtnWrapper: {
        width: '100%',
        borderRadius: 24,
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    shareBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        borderRadius: 24,
        gap: 10,
    },
    shareBtnText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 16,
        color: '#FFF',
        letterSpacing: 0.5,
        includeFontPadding: false,
    }
});