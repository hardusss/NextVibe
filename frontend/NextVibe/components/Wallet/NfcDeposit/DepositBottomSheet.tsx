import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import {
    useColorScheme, StyleSheet, Text, TextInput,
    TouchableOpacity, View, Pressable, Vibration
} from 'react-native';
import {
    BottomSheetModal,
    BottomSheetView,
    useBottomSheet,
    BottomSheetBackdropProps
} from '@gorhom/bottom-sheet';
import { Nfc, CheckCircle2 } from "lucide-react-native";
import { TOKENS } from "@/constants/Tokens";
import FastImage from 'react-native-fast-image';
import Animated, {
    interpolate, Extrapolation, useAnimatedStyle,
    useSharedValue, withRepeat, withSequence, withTiming
} from 'react-native-reanimated';
import { BlurView } from '@react-native-community/blur';
import useWalletAddress from '@/hooks/useWalletAddress';
import { HCESession, NFCTagType4, NFCTagType4NDEFContentType } from 'react-native-hce';

import Web3Toast from '@/components/Shared/Toasts/Web3Toast';

export interface DepositSheetRef {
    present: () => void;
    dismiss: () => void;
}

const AVAILABLE_TOKENS = [TOKENS.SOL, TOKENS.USDC];
const DECIMAL_LIMIT = 8;

const AnimatedNfc = Animated.createAnimatedComponent(Nfc);

export const CustomBackdrop = ({ animatedIndex, style }: BottomSheetBackdropProps) => {
    const theme = useColorScheme();
    const isDark = theme === 'dark';
    const { close } = useBottomSheet();

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            animatedIndex.value,
            [-1, 0],
            [0, 1],
            Extrapolation.CLAMP
        ),
    }));

    return (
        <Animated.View style={[StyleSheet.absoluteFill, style, animatedStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => close()}>
                <BlurView
                    style={StyleSheet.absoluteFill}
                    blurType={isDark ? "dark" : "light"}
                    blurAmount={2}
                />
                <View
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.2)' }
                    ]}
                />
            </Pressable>
        </Animated.View>
    );
};

export const DepositBottomSheet = forwardRef<DepositSheetRef>((props, ref) => {
    const theme = useColorScheme();
    const isDark = theme === 'dark';

    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const inputRef = useRef<TextInput>(null);

    const [amount, setAmount] = useState('');
    const [selectedToken, setSelectedToken] = useState(TOKENS.SOL.symbol);
    const [isBroadcasting, setIsBroadcasting] = useState(false);

    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastIsSuccess, setToastIsSuccess] = useState(true);

    const { address } = useWalletAddress();

    const hceSessionRef = useRef<any>(null);
    const removeListenerRef = useRef<(() => void) | null>(null);
    const lastReadTimestamp = useRef<number>(0);

    const pulseScale = useSharedValue(1);
    const pulseOpacity = useSharedValue(1);

    const showToast = (message: string, isSuccess: boolean) => {
        setToastMessage(message);
        setToastIsSuccess(isSuccess);
        setToastVisible(true);
    };

    useEffect(() => {
        if (isBroadcasting) {
            pulseScale.value = withRepeat(
                withSequence(withTiming(1.25, { duration: 800 }), withTiming(1, { duration: 800 })),
                -1,
                true
            );
            pulseOpacity.value = withRepeat(
                withSequence(withTiming(0.4, { duration: 800 }), withTiming(1, { duration: 800 })),
                -1,
                true
            );
        } else {
            pulseScale.value = withTiming(1, { duration: 300 });
            pulseOpacity.value = withTiming(1, { duration: 300 });
        }
    }, [isBroadcasting]);

    const animatedIconStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
        opacity: pulseOpacity.value,
    }));

    const stopHceTransaction = async () => {
        try {
            if (removeListenerRef.current) {
                removeListenerRef.current();
                removeListenerRef.current = null;
            }
            if (hceSessionRef.current) {
                await hceSessionRef.current.setEnabled(false);
            }
            setIsBroadcasting(false);
        } catch (error) {
            console.error("❌ Failed to stop HCE:", error);
        }
    };

    useImperativeHandle(ref, () => ({
        present: () => {
            bottomSheetModalRef.current?.present();
            setTimeout(() => {
                inputRef.current?.focus();
            }, 150);
        },
        dismiss: () => {
            stopHceTransaction();
            bottomSheetModalRef.current?.dismiss();
            setAmount('');
        },
    }));

    const handleAmountChange = (text: string) => {
        const normalizedText = text.replace(',', '.');
        const regex = new RegExp(`^\\d*\\.?\\d{0,${DECIMAL_LIMIT}}$`);

        if (regex.test(normalizedText)) {
            setAmount(normalizedText);
        }
    };

    const startHceTransaction = async () => {
        try {
            setIsBroadcasting(true);
            const URL = `https://nextvibe.io/u/send?amount=${amount}&token=${selectedToken}&address=${address}`;

            const tag = new NFCTagType4({
                type: NFCTagType4NDEFContentType.URL,
                content: URL,
                writable: false,
            });

            const session = await HCESession.getInstance();
            hceSessionRef.current = session;
            await session.setApplication(tag);
            await session.setEnabled(true);

            removeListenerRef.current = session.on(HCESession.Events.HCE_STATE_READ, () => {
                const now = Date.now();
                if (now - lastReadTimestamp.current > 2000) {
                    console.log("✅ Valid read!");
                    lastReadTimestamp.current = now;

                    Vibration.vibrate([0, 100, 100, 100]);
                    showToast("NFC details sent successfully!", true);
                    stopHceTransaction();
                }
            });

        } catch (error: any) {
            showToast("Failed to start NFC. Please try again.", false);
            setIsBroadcasting(false);
            console.error("❌ Failed to start HCE:", error);
        }
    };

    const bg = isDark ? '#0f021c' : '#ffffff';
    const mainColor = isDark ? '#ffffff' : '#1f2937';
    const mutedColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.32)';
    const borderColor = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';
    const inputBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
    const iconColor = isDark ? 'rgba(196,167,255,0.9)' : 'rgba(109,40,217,0.85)';
    const handleColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
    const tokenBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
    const tokenActiveBg = isDark ? 'rgba(167,139,250,0.14)' : 'rgba(109,40,217,0.08)';
    const tokenActiveBorder = isDark ? 'rgba(196,167,255,0.4)' : 'rgba(109,40,217,0.3)';

    const isReady = amount.length > 0 && amount !== '.' && parseFloat(amount) > 0;

    return (
        <BottomSheetModal
            ref={bottomSheetModalRef}
            snapPoints={['55%']}
            index={0}
            backdropComponent={CustomBackdrop}
            backgroundStyle={{ backgroundColor: bg }}
            handleIndicatorStyle={{
                backgroundColor: handleColor,
                width: 36,
            }}
            onDismiss={stopHceTransaction}
        >
            <BottomSheetView style={[styles.container, { backgroundColor: bg }]}>

                <Web3Toast
                    visible={toastVisible}
                    message={toastMessage}
                    isSuccess={toastIsSuccess}
                    onHide={() => setToastVisible(false)}
                />

                <View style={styles.header}>
                    <Nfc size={16} color={iconColor} strokeWidth={1.5} />
                    <Text style={[styles.headerTitle, { color: mainColor }]}>Receive via NFC</Text>
                </View>

                <Text style={[styles.sectionLabel, { color: mutedColor }]}>AMOUNT</Text>
                <View style={styles.inputWrap}>
                    <TextInput
                        ref={inputRef}
                        style={[styles.input, { color: mainColor }]}
                        value={amount}
                        onChangeText={handleAmountChange}
                        placeholder="0.00"
                        placeholderTextColor={mutedColor}
                        keyboardType="decimal-pad"
                        selectionColor={isDark ? '#a78bfa' : '#7c3aed'}
                        editable={!isBroadcasting}
                    />
                </View>

                <Text style={[styles.sectionLabel, { color: mutedColor }]}>TOKEN</Text>
                <View style={styles.tokensRow}>
                    {AVAILABLE_TOKENS.map((token) => {
                        const isSelected = selectedToken === token.symbol;
                        return (
                            <TouchableOpacity
                                key={token.symbol}
                                onPress={() => !isBroadcasting && setSelectedToken(token.symbol)}
                                activeOpacity={0.7}
                                style={[
                                    styles.tokenBtn,
                                    {
                                        backgroundColor: isSelected ? tokenActiveBg : tokenBg,
                                        borderColor: isSelected ? tokenActiveBorder : borderColor,
                                        opacity: isBroadcasting ? 0.5 : 1,
                                    },
                                ]}
                            >
                                <FastImage
                                    source={{ uri: token.logoURL }}
                                    style={styles.tokenIcon}
                                />
                                <Text style={[styles.tokenSymbol, { color: isSelected ? (isDark ? '#d8b4fe' : '#7c3aed') : mutedColor }]}>
                                    {token.symbol}
                                </Text>
                                {isSelected && (
                                    <CheckCircle2
                                        size={14}
                                        color={isDark ? '#a78bfa' : '#7c3aed'}
                                        strokeWidth={1.8}
                                        style={{ marginLeft: 6 }}
                                    />
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <TouchableOpacity
                    onPress={isBroadcasting ? stopHceTransaction : startHceTransaction}
                    style={[
                        styles.readyBtn,
                        {
                            backgroundColor: isReady
                                ? (isDark ? 'rgba(167,139,250,0.18)' : 'rgba(109,40,217,0.1)')
                                : inputBg,
                            borderColor: isReady ? tokenActiveBorder : borderColor,
                        },
                    ]}
                    activeOpacity={0.75}
                    disabled={!isReady && !isBroadcasting}
                >
                    {isBroadcasting ? (
                        <>
                            <AnimatedNfc
                                size={18}
                                color={isDark ? '#d8b4fe' : '#7c3aed'}
                                strokeWidth={1.5}
                                style={animatedIconStyle}
                            />
                            <Text style={[
                                styles.readyText,
                                { color: isDark ? '#d8b4fe' : '#7c3aed' }
                            ]}>
                                Waiting for phone...
                            </Text>
                        </>
                    ) : (
                        <>
                            <Nfc
                                size={18}
                                color={isReady ? (isDark ? '#d8b4fe' : '#7c3aed') : mutedColor}
                                strokeWidth={1.5}
                            />
                            <Text style={[
                                styles.readyText,
                                { color: isReady ? (isDark ? '#d8b4fe' : '#7c3aed') : mutedColor }
                            ]}>
                                Ready to Receive
                            </Text>
                        </>
                    )}
                </TouchableOpacity>

            </BottomSheetView>
        </BottomSheetModal>
    );
});

DepositBottomSheet.displayName = 'DepositBottomSheet';

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 32,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 28,
    },
    headerTitle: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 18,
        includeFontPadding: false,
    },
    sectionLabel: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        letterSpacing: 2,
        marginBottom: 10,
        textAlign: 'center',
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
    },
    input: {
        flex: 1,
        fontFamily: 'Dank Mono',
        fontSize: 52,
        letterSpacing: -2,
        includeFontPadding: false,
        paddingVertical: 16,
        textAlign: 'center',
    },
    tokensRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 28,
    },
    tokenBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 16,
        borderWidth: 1,
    },
    tokenIcon: {
        width: 22,
        height: 22,
        borderRadius: 11,
        marginRight: 8,
    },
    tokenSymbol: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 13,
        includeFontPadding: false,
    },
    readyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        height: 58,
        borderRadius: 20,
        borderWidth: 1,
    },
    readyText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 15,
        includeFontPadding: false,
    },
});