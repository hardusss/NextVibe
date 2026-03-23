import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, TextInput, StyleSheet,
    Animated, TouchableOpacity, ScrollView, RefreshControl,
    Vibration, Keyboard, StatusBar, Platform, Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useColorScheme } from 'react-native';
import { ArrowLeft, AlertCircle, ArrowDown, ChevronDown } from 'lucide-react-native';

import useTransaction from '@/hooks/useTransaction';
import usePortfolio from '@/hooks/usePortfolio';
import { useTransactionForm } from '@/hooks/useTransactionForm';

import { SwipeButton } from './SwipeButton';
import TokenInfoCard from './TokenInfoCard';
import LazorKitShield from './LazorKitShield';
import useWalletAddress from '@/hooks/useWalletAddress';

export default function CreateTransactionScreen() {
    const { token, symbol, address, amount: queryAmount } = useLocalSearchParams();
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();

    const { sendTransaction } = useTransaction();
    const { data, refresh } = usePortfolio();
    const { address: smartWalletPubkey, walletType } = useWalletAddress();

    const rawSymbol = token || symbol;
    const incomingSymbol = Array.isArray(rawSymbol) ? rawSymbol[0] : rawSymbol;
    const incomingAddress = Array.isArray(address) ? address[0] : address;
    const incomingAmount = Array.isArray(queryAmount) ? queryAmount[0] : queryAmount;

    const [selectedTokenSymbol, setSelectedTokenSymbol] = useState(incomingSymbol || (data.tokens[0]?.symbol));
    const [tokenPickerVisible, setTokenPickerVisible] = useState(false);

    const liveToken = data.tokens.find(t => t.symbol === selectedTokenSymbol);
    const [cachedToken, setCachedToken] = useState(liveToken);

    useEffect(() => { if (liveToken) setCachedToken(liveToken); }, [liveToken]);

    const activeToken = liveToken || cachedToken;
    const tokenSymbolStr = selectedTokenSymbol || activeToken?.symbol || "";
    const currentBalance = activeToken?.amount ?? 0;
    const currentUsdValue = activeToken?.valueUsd ?? 0;
    const tokenName = activeToken?.name ?? tokenSymbolStr;
    const tokenIcon = activeToken?.logoURI;

    const tokenPrice = currentBalance > 0 ? currentUsdValue / currentBalance : 0;

    const { recipient, setRecipient, amount, setAmount, handleMax, validate, resetForm } = useTransactionForm();

    const typedAmountNum = Number(amount) || 0;
    const typedAmountUsd = (typedAmountNum * tokenPrice).toFixed(2);

    const handleAmountChange = (text: string) => {
        let cleaned = text.replace(',', '.');
        cleaned = cleaned.replace(/[^0-9.]/g, '');
        
        if (cleaned.startsWith('.')) {
            cleaned = '0' + cleaned;
        }
        
        const dotIndex = cleaned.indexOf('.');
        if (dotIndex !== -1) {
            cleaned = cleaned.slice(0, dotIndex + 1) + cleaned.slice(dotIndex + 1).replace(/\./g, '');
        }
        
        setAmount(cleaned);
    };

    useEffect(() => {
        if (incomingAddress) setRecipient(incomingAddress);
        if (incomingAmount) handleAmountChange(incomingAmount);
    }, [incomingAddress, incomingAmount]);

    const handleTokenSelect = (newSymbol: string) => {
        setSelectedTokenSymbol(newSymbol);
        setAmount('');
        setTokenPickerVisible(false);
        Vibration.vibrate(50);
    };

    const handlePercentage = (percent: number) => {
        if (currentBalance <= 0) return;
        const calc = (currentBalance * percent).toFixed(6);
        const finalVal = parseFloat(calc).toString();
        setAmount(finalVal);
        Vibration.vibrate(30);
    };

    const [isSuccess, setIsSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isFailed, setIsFailed] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [kbVisible, setKbVisible] = useState(false);

    const recipientRef = useRef(recipient);
    const amountRef = useRef(amount);
    const symbolRef = useRef(tokenSymbolStr);

    useEffect(() => { recipientRef.current = recipient; }, [recipient]);
    useEffect(() => { amountRef.current = amount; }, [amount]);
    useEffect(() => { if (tokenSymbolStr) symbolRef.current = tokenSymbolStr; }, [tokenSymbolStr]);

    useEffect(() => {
        const show = Keyboard.addListener('keyboardDidShow', () => setKbVisible(true));
        const hide = Keyboard.addListener('keyboardDidHide', () => setKbVisible(false));
        return () => { show.remove(); hide.remove(); };
    }, []);

    const errorAnim = useRef(new Animated.Value(0)).current;

    const showError = (msg: string) => {
        setErrorMsg(msg);
        Animated.sequence([
            Animated.spring(errorAnim, { toValue: 1, useNativeDriver: true, friction: 7 }),
            Animated.delay(3000),
            Animated.timing(errorAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => setErrorMsg(''));
    };

    useFocusEffect(useCallback(() => {
        if (isFailed) {
            const t = setTimeout(() => setIsFailed(false), 2000);
            return () => clearTimeout(t);
        }
    }, [isFailed]));

    const resetScreen = () => { resetForm(); setIsSuccess(false); setIsLoading(false); setIsFailed(false); };

    const onRefresh = useCallback(async () => {
        setRefreshing(true); await refresh(); resetScreen(); setRefreshing(false);
    }, [refresh]);

    const executeTransaction = async () => {
        const error = validate(currentBalance);
        if (error) { setIsFailed(true); showError(error); return; }
        if (!symbolRef.current) { setIsFailed(true); showError('Token symbol error'); return; }

        setIsLoading(true);
        try {
            const txSig = await sendTransaction(recipientRef.current, Number(amountRef.current), symbolRef.current);
            if (txSig) {
                setIsSuccess(true);
                Vibration.vibrate(100);
                setTimeout(() => {
                    resetScreen();
                    router.push({
                        pathname: "/result-transaction",
                        params: {
                            from: smartWalletPubkey?.toString() || "Unknown",
                            to: recipientRef.current,
                            amount: amountRef.current,
                            symbol: symbolRef.current,
                            tx_url: `https://solscan.io/tx/${txSig}?cluster=devnet`,
                        },
                    });
                }, 1000);
            }
        } catch (e: any) {
            setIsFailed(true);
            Vibration.vibrate([0, 400]);
            showError(e instanceof Error ? e.message : "Transaction failed");
        } finally {
            setIsLoading(false);
        }
    };

    const gradientColors = isDark ? ['#0A0410', '#1a0a2e', '#0A0410'] : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff'];
    const mainColor = isDark ? "#FFFFFF" : "#111827";
    const mutedColor = isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)";
    const accentColor = isDark ? "#C4A7FF" : "#6D28D9";
    const pillBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.7)";
    const pillBorder = isDark ? "rgba(255,255,255,0.15)" : "rgba(109,40,217,0.15)";
    const modalBg = isDark ? "rgba(10, 4, 16, 0.95)" : "rgba(255, 255, 255, 0.95)";

    const errorTranslateY = errorAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] });

    return (
        <LinearGradient colors={gradientColors} style={styles.root}>
            <StatusBar backgroundColor={isDark ? "#0A0410" : "#FFFFFF"} barStyle={isDark ? "light-content" : "dark-content"} />

            <Animated.View
                pointerEvents="none"
                style={[styles.errorToast, {
                    opacity: errorAnim,
                    transform: [{ translateY: errorTranslateY }],
                    backgroundColor: isDark ? '#450a0a' : '#fef2f2',
                    borderColor: isDark ? '#dc2626' : '#f87171',
                }]}
            >
                <AlertCircle size={18} color={isDark ? "#f87171" : "#ef4444"} strokeWidth={1.5} />
                <Text style={[styles.errorText, { color: isDark ? '#fca5a5' : '#b91c1c' }]}>
                    {errorMsg}
                </Text>
            </Animated.View>

            <Modal
                visible={tokenPickerVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setTokenPickerVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalCloseArea} onPress={() => setTokenPickerVisible(false)} />
                    <View style={[styles.modalContent, { backgroundColor: modalBg, borderColor: pillBorder }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: mainColor }]}>Select Token</Text>
                            <TouchableOpacity onPress={() => setTokenPickerVisible(false)}>
                                <Text style={[styles.modalCloseText, { color: accentColor }]}>Close</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {data.tokens.map((t) => (
                                <TouchableOpacity
                                    key={t.symbol}
                                    onPress={() => handleTokenSelect(t.symbol)}
                                    style={[styles.tokenOption, t.symbol === selectedTokenSymbol && { backgroundColor: pillBg }]}
                                >
                                    <View style={styles.tokenOptionInfo}>
                                        <Text style={[styles.tokenOptionSymbol, { color: mainColor }]}>{t.symbol}</Text>
                                        <Text style={[styles.tokenOptionName, { color: mutedColor }]}>{t.name}</Text>
                                    </View>
                                    <View style={styles.tokenOptionBalance}>
                                        <Text style={[styles.tokenOptionAmt, { color: mainColor }]}>{t.amount.toFixed(4)}</Text>
                                        <Text style={[styles.tokenOptionUsd, { color: mutedColor }]}>${t.valueUsd.toFixed(2)}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <ScrollView
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? "#fff" : "#000"} />}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        style={[styles.iconBtn, { backgroundColor: pillBg, borderColor: pillBorder }]}
                    >
                        <ArrowLeft size={20} color={mainColor} strokeWidth={1.5} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setTokenPickerVisible(true)}
                        style={[styles.tokenPill, { backgroundColor: pillBg, borderColor: pillBorder }]}
                    >
                        <Text style={[styles.tokenPillText, { color: mainColor }]}>{tokenSymbolStr}</Text>
                        <ChevronDown size={14} color={mutedColor} style={{ marginLeft: 6 }} />
                    </TouchableOpacity>

                    <View style={styles.iconBtn} />
                </View>

                <View style={styles.amountContainer}>
                    <TextInput
                        style={[styles.massiveInput, { color: mainColor }]}
                        value={amount}
                        onChangeText={handleAmountChange}
                        placeholder="0"
                        placeholderTextColor={mutedColor}
                        keyboardType="decimal-pad"
                        autoFocus
                        autoCorrect={false}
                        selectionColor={accentColor}
                        numberOfLines={1}
                    />

                    {tokenPrice > 0 && typedAmountNum > 0 && (
                        <Text style={[styles.usdLiveText, { color: mutedColor }]}>
                            ~${typedAmountUsd}
                        </Text>
                    )}

                    <Text style={[styles.balanceText, { color: mutedColor }]}>
                        Available: {currentBalance.toFixed(4)} {tokenSymbolStr}
                    </Text>

                    <View style={styles.percentRow}>
                        {[0.25, 0.5, 0.75, 1].map((pct, idx) => {
                            const labels = ["25%", "50%", "75%", "MAX"];
                            return (
                                <TouchableOpacity
                                    key={pct}
                                    style={[styles.percentBtn, { backgroundColor: pillBg, borderColor: pillBorder }]}
                                    onPress={() => handlePercentage(pct)}
                                >
                                    <Text style={[styles.percentText, { color: mainColor }]}>{labels[idx]}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                <View style={styles.recipientContainer}>
                    <View style={styles.arrowWrap}>
                        <View style={[styles.arrowCircle, { backgroundColor: pillBg, borderColor: pillBorder }]}>
                            <ArrowDown size={16} color={mutedColor} strokeWidth={1.5} />
                        </View>
                    </View>

                    <Text style={[styles.toLabel, { color: mutedColor }]}>To</Text>
                    <TextInput
                        style={[styles.recipientInput, { backgroundColor: pillBg, borderColor: pillBorder, color: mainColor }]}
                        value={recipient}
                        onChangeText={setRecipient}
                        placeholder="Paste wallet address"
                        placeholderTextColor={mutedColor}
                        autoCorrect={false}
                        autoCapitalize="none"
                        selectionColor={accentColor}
                    />
                </View>

                <View style={styles.infoSection}>
                    <TokenInfoCard
                        tokenName={tokenName}
                        tokenSymbol={tokenSymbolStr}
                        tokenIcon={tokenIcon as string}
                        usdValue={currentUsdValue}
                        balance={currentBalance}
                        isDark={isDark}
                    />
                </View>

                {walletType !== 'mwa' && (
                    <View style={styles.shieldWrap}>
                        <LazorKitShield isDark={isDark} />
                    </View>
                )}
            </ScrollView>

            {!kbVisible && (
                <View style={styles.swipeWrap}>
                    <SwipeButton
                        onSwipeSuccess={executeTransaction}
                        isLoading={isLoading}
                        isSuccess={isSuccess}
                        isFailed={isFailed}
                        isDark={isDark}
                    />
                </View>
            )}
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    scroll: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: 140 },
    errorToast: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 56 : 44,
        left: 20,
        right: 20,
        zIndex: 100,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 16,
        borderWidth: 1.5,
        paddingHorizontal: 16,
        paddingVertical: 14,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
    },
    errorText: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        includeFontPadding: false,
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    iconBtn: {
        width: 44, height: 44,
        borderRadius: 22, borderWidth: 1,
        justifyContent: 'center', alignItems: 'center',
    },
    tokenPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 10,
        borderRadius: 20, borderWidth: 1,
    },
    tokenPillText: {
        fontFamily: 'Dank Mono',
        fontSize: 16,
        includeFontPadding: false,
    },
    amountContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    massiveInput: {
        fontFamily: 'Dank Mono',
        fontSize: 72,
        minHeight: 100,
        lineHeight: Platform.OS === 'ios' ? 0 : 85,
        paddingTop: 10,
        paddingBottom: 5,
        textAlign: 'center',
        includeFontPadding: false,
        width: '100%',
    },
    usdLiveText: {
        fontFamily: 'Dank Mono',
        fontSize: 16,
        marginTop: -5,
        marginBottom: 10,
        includeFontPadding: false,
    },
    balanceText: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        marginBottom: 16,
        includeFontPadding: false,
    },
    percentRow: {
        flexDirection: 'row',
        gap: 8,
        justifyContent: 'center',
    },
    percentBtn: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 14,
        borderWidth: 1,
    },
    percentText: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        includeFontPadding: false,
    },
    recipientContainer: {
        marginBottom: 24,
    },
    arrowWrap: {
        alignItems: 'center',
        marginBottom: -14,
        zIndex: 10,
    },
    arrowCircle: {
        width: 28, height: 28,
        borderRadius: 14, borderWidth: 1,
        justifyContent: 'center', alignItems: 'center',
    },
    toLabel: {
        fontFamily: 'Dank Mono',
        fontSize: 12,
        textTransform: 'uppercase',
        marginBottom: 8,
        marginLeft: 4,
        includeFontPadding: false,
    },
    recipientInput: {
        fontFamily: 'Dank Mono',
        fontSize: 15,
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 20,
        paddingVertical: 18,
        minHeight: 60,
        includeFontPadding: false,
    },
    infoSection: {
        marginBottom: 16,
    },
    shieldWrap: {
        alignItems: 'center',
        marginTop: 10,
    },
    swipeWrap: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 36 : 24,
        left: 0, right: 0,
        alignItems: 'center',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalCloseArea: {
        flex: 1,
    },
    modalContent: {
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        borderWidth: 1,
        borderBottomWidth: 0,
        padding: 24,
        maxHeight: '60%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontFamily: 'Dank Mono',
        fontSize: 18,
        includeFontPadding: false,
    },
    modalCloseText: {
        fontFamily: 'Dank Mono',
        fontSize: 14,
        includeFontPadding: false,
    },
    tokenOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 12,
        borderRadius: 16,
    },
    tokenOptionInfo: {
        flex: 1,
        gap: 2,
    },
    tokenOptionSymbol: {
        fontFamily: 'Dank Mono',
        fontSize: 16,
        includeFontPadding: false,
    },
    tokenOptionName: {
        fontFamily: 'Dank Mono',
        fontSize: 12,
        includeFontPadding: false,
    },
    tokenOptionBalance: {
        alignItems: 'flex-end',
        gap: 2,
    },
    tokenOptionAmt: {
        fontFamily: 'Dank Mono',
        fontSize: 15,
        includeFontPadding: false,
    },
    tokenOptionUsd: {
        fontFamily: 'Dank Mono',
        fontSize: 12,
        includeFontPadding: false,
    },
});