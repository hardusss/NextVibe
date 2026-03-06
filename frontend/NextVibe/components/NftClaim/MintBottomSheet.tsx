import React, { useCallback, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import {
    Text, StyleSheet, View, useColorScheme,
    TouchableOpacity, Animated, TextInput,
    Modal, Dimensions, PanResponder, KeyboardAvoidingView, Platform,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Wallet, Coins, CheckCircle, AlertCircle, X } from 'lucide-react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.62;
const DRAG_THRESHOLD = 80;

export interface MintBottomSheetRef {
    present: () => void;
    dismiss: () => void;
}

export interface MintBottomSheetProps {
    postId: number;
    imageUrl: string | null;
    creatorUsername: string;
    walletConnected: boolean;
    onMint: (postId: number, price: number) => Promise<void>;
}

const MintBottomSheet = forwardRef<MintBottomSheetRef, MintBottomSheetProps>((props, ref) => {
    const theme = useColorScheme();
    const isDark = theme === 'dark';

    const colors = isDark ? {
        background: '#0f021c',
        cardBg: 'rgba(255, 255, 255, 0.05)',
        textColor: '#ffffff',
        subText: '#a1a1aa',
        handleColor: 'rgba(255,255,255,0.3)',
        accent: '#a855f7',
        border: 'rgba(168, 85, 247, 0.2)',
        borderFocused: 'rgba(168, 85, 247, 0.6)',
        warnBg: 'rgba(251, 191, 36, 0.08)',
        warnText: '#fbbf24',
        divider: 'rgba(168, 85, 247, 0.12)',
        inputBg: 'rgba(168, 85, 247, 0.07)',
        backdrop: 'rgba(0,0,0,0.6)',
    } : {
        background: '#ffffff',
        cardBg: 'rgba(0, 0, 0, 0.03)',
        textColor: '#1f2937',
        subText: '#6b7280',
        handleColor: '#d1d5db',
        accent: '#7c3aed',
        border: 'rgba(124, 58, 237, 0.2)',
        borderFocused: 'rgba(124, 58, 237, 0.6)',
        warnBg: 'rgba(251, 191, 36, 0.08)',
        warnText: '#d97706',
        divider: 'rgba(124, 58, 237, 0.1)',
        inputBg: 'rgba(124, 58, 237, 0.05)',
        backdrop: 'rgba(0,0,0,0.5)',
    };

    const [visible, setVisible] = useState(false);
    const [isMinting, setIsMinting] = useState(false);
    const [minted, setMinted] = useState(false);
    const [priceInput, setPriceInput] = useState('');
    const [inputFocused, setInputFocused] = useState(false);

    const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const mintScaleAnim = useRef(new Animated.Value(1)).current;
    const dragY = useRef(new Animated.Value(0)).current;

    const openSheet = () => {
        setVisible(true);
        translateY.setValue(SHEET_HEIGHT);
        backdropOpacity.setValue(0);
        Animated.parallel([
            Animated.spring(translateY, {
                toValue: 0,
                tension: 65,
                friction: 11,
                useNativeDriver: true,
            }),
            Animated.timing(backdropOpacity, {
                toValue: 1,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start();
    };

    const closeSheet = (onDone?: () => void) => {
        Animated.parallel([
            Animated.timing(translateY, {
                toValue: SHEET_HEIGHT,
                duration: 280,
                useNativeDriver: true,
            }),
            Animated.timing(backdropOpacity, {
                toValue: 0,
                duration: 220,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setVisible(false);
            dragY.setValue(0);
            onDone?.();
        });
    };

    const handleDismiss = useCallback(() => {
        closeSheet(() => {
            setMinted(false);
            setIsMinting(false);
            setPriceInput('');
        });
    }, []);

    useImperativeHandle(ref, () => ({
        present: openSheet,
        dismiss: handleDismiss,
    }));

    // Swipe to dismiss
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: (_, g) => g.dy > 0,
            onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
            onPanResponderMove: (_, g) => {
                if (g.dy > 0) dragY.setValue(g.dy);
            },
            onPanResponderRelease: (_, g) => {
                if (g.dy > DRAG_THRESHOLD) {
                    handleDismiss();
                } else {
                    Animated.spring(dragY, {
                        toValue: 0,
                        useNativeDriver: true,
                    }).start();
                }
            },
        })
    ).current;

    const price = parseFloat(priceInput) || 0;
    const royalty = price * 0.05;
    const youReceive = price - royalty;
    const isValidPrice = price > 0;

    const handleMint = async () => {
        if (!props.walletConnected || isMinting || minted || !isValidPrice) return;

        Animated.sequence([
            Animated.timing(mintScaleAnim, { toValue: 0.95, duration: 80, useNativeDriver: true }),
            Animated.timing(mintScaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        ]).start();

        setIsMinting(true);
        try {
            await props.onMint(props.postId, price);
            setMinted(true);
        } catch (e) {
            console.error(e);
        } finally {
            setIsMinting(false);
        }
    };

    const isButtonDisabled = !props.walletConnected || isMinting || minted || !isValidPrice;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={handleDismiss}
        >
            {/* Backdrop */}
            <Animated.View
                style={[styles.backdrop, { opacity: backdropOpacity, backgroundColor: colors.backdrop }]}
            >
                <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={handleDismiss} activeOpacity={1} />
            </Animated.View>

            {/* Sheet */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.keyboardView}
                pointerEvents="box-none"
            >
                <Animated.View
                    style={[
                        styles.sheet,
                        { backgroundColor: colors.background, transform: [{ translateY: Animated.add(translateY, dragY) }] },
                    ]}
                >
                    {/* Drag handle */}
                    <View style={styles.handleArea} {...panResponder.panHandlers}>
                        <View style={[styles.handle, { backgroundColor: colors.handleColor }]} />
                    </View>

                    {/* Header */}
                    <View style={styles.headerRow}>
                        <Text style={[styles.title, { color: colors.textColor }]}>
                            {minted ? 'Minted!' : 'Mint Post'}
                        </Text>
                        <View style={styles.headerRight}>
                            {minted
                                ? <CheckCircle size={20} color={colors.accent} />
                                : <Coins size={20} color={colors.accent} />
                            }
                            <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <X size={20} color={colors.subText} style={{ marginLeft: 12 }} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Post preview */}
                    <View style={[styles.previewCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                        {props.imageUrl && (
                            <FastImage
                                source={{ uri: props.imageUrl }}
                                style={styles.postThumb}
                                resizeMode={FastImage.resizeMode.cover}
                            />
                        )}
                        <View style={styles.previewInfo}>
                            <Text style={[styles.postLabel, { color: colors.subText }]}>Post by</Text>
                            <Text style={[styles.postCreator, { color: colors.textColor }]}>
                                @{props.creatorUsername}
                            </Text>
                        </View>
                    </View>

                    {/* Price input */}
                    <View style={[
                        styles.inputCard,
                        { backgroundColor: colors.inputBg, borderColor: inputFocused ? colors.borderFocused : colors.border }
                    ]}>
                        <Text style={[styles.inputLabel, { color: colors.subText }]}>Set mint price</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                value={priceInput}
                                onChangeText={setPriceInput}
                                onFocus={() => setInputFocused(true)}
                                onBlur={() => setInputFocused(false)}
                                placeholder="0.00"
                                placeholderTextColor={colors.subText}
                                keyboardType="decimal-pad"
                                style={[styles.input, { color: colors.textColor }]}
                                editable={!minted}
                            />
                            <Text style={[styles.inputCurrency, { color: colors.accent }]}>SOL</Text>
                        </View>
                    </View>

                    {/* Fee breakdown */}
                    {isValidPrice && (
                        <View style={[styles.feeCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                            <Text style={[styles.feeTitle, { color: colors.subText }]}>You'll receive at claim</Text>
                            <View style={styles.feeRow}>
                                <Text style={[styles.feeLabel, { color: colors.subText }]}>Creator receives</Text>
                                <Text style={[styles.feeValue, { color: colors.textColor }]}>{youReceive.toFixed(4)} SOL</Text>
                            </View>
                            <View style={[styles.feeDivider, { backgroundColor: colors.divider }]} />
                            <View style={styles.feeRow}>
                                <Text style={[styles.feeLabel, { color: colors.subText }]}>Platform fee (5%)</Text>
                                <Text style={[styles.feeValue, { color: colors.subText }]}>{royalty.toFixed(4)} SOL</Text>
                            </View>
                        </View>
                    )}

                    {/* Wallet warning */}
                    {!props.walletConnected && (
                        <View style={[styles.warnCard, { backgroundColor: colors.warnBg }]}>
                            <AlertCircle size={16} color={colors.warnText} />
                            <Text style={[styles.warnText, { color: colors.warnText }]}>Connect your wallet to mint</Text>
                        </View>
                    )}

                    <View style={{ flex: 1 }} />

                    {/* Mint button */}
                    <Animated.View style={[styles.buttonContainer, { transform: [{ scale: mintScaleAnim }] }]}>
                        <TouchableOpacity onPress={handleMint} activeOpacity={0.8} disabled={isButtonDisabled}>
                            <LinearGradient
                                colors={
                                    minted
                                        ? ['#16a34a', '#15803d']
                                        : !props.walletConnected || !isValidPrice
                                            ? ['#4b5563', '#374151']
                                            : ['#7c3aed', '#6d28d9']
                                }
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.gradientButton}
                            >
                                {minted ? (
                                    <>
                                        <CheckCircle size={20} color="white" />
                                        <Text style={styles.buttonText}>  Minted!</Text>
                                    </>
                                ) : !props.walletConnected ? (
                                    <>
                                        <Wallet size={20} color="white" />
                                        <Text style={styles.buttonText}>  Connect Wallet</Text>
                                    </>
                                ) : (
                                    <Text style={styles.buttonText}>
                                        {isMinting ? 'Minting...' : isValidPrice ? `Mint for ${price} SOL` : 'Enter price to mint'}
                                    </Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
});

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    keyboardView: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheet: {
        height: SHEET_HEIGHT,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingBottom: 32,
    },
    handleArea: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    title: {
        fontSize: 22,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    previewCard: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        borderWidth: 1,
        padding: 12,
        marginBottom: 12,
        gap: 12,
    },
    postThumb: {
        width: 56,
        height: 56,
        borderRadius: 12,
        backgroundColor: '#1f1f2e',
    },
    previewInfo: {
        flex: 1,
        gap: 2,
    },
    postLabel: {
        fontSize: 12,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
    },
    postCreator: {
        fontSize: 16,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    inputCard: {
        width: '100%',
        borderRadius: 20,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 12,
    },
    inputLabel: {
        fontSize: 12,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
        marginBottom: 6,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    input: {
        flex: 1,
        fontSize: 28,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        padding: 0,
    },
    inputCurrency: {
        fontSize: 18,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        marginLeft: 8,
    },
    feeCard: {
        width: '100%',
        borderRadius: 20,
        borderWidth: 1,
        padding: 16,
        marginBottom: 12,
        gap: 10,
    },
    feeTitle: {
        fontSize: 12,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
        marginBottom: 2,
    },
    feeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    feeLabel: {
        fontSize: 14,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
    },
    feeValue: {
        fontSize: 14,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    feeDivider: {
        height: 1,
        width: '100%',
    },
    warnCard: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        padding: 12,
        gap: 8,
        marginBottom: 8,
    },
    warnText: {
        fontSize: 13,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
    },
    buttonContainer: {
        width: '100%',
        shadowColor: '#7c3aed',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 10,
    },
    gradientButton: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
    },
    buttonText: {
        color: 'white',
        fontSize: 18,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
});

export default MintBottomSheet;