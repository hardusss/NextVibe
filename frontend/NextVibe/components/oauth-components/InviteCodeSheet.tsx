import React, { forwardRef, useCallback, useRef, useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput,
    TouchableOpacity, ActivityIndicator,
    useColorScheme, Keyboard, Vibration, Animated,
} from 'react-native';
import {
    BottomSheetModal,
    BottomSheetView,
    BottomSheetBackdrop,
    BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Ticket, AlertCircle, ArrowRight } from 'lucide-react-native';

const CODE_LENGTH = 6;

interface InviteCodeSheetProps {
    onSubmit: (code: string) => Promise<void>;
}

const InviteCodeSheet = forwardRef<BottomSheetModal, InviteCodeSheetProps>(
    ({ onSubmit }, ref) => {
        const isDark = useColorScheme() === 'dark';

        const c = {
            bg: '#110a1e',
            text: '#f0e6ff',
            sub: '#7c6a9a',
            handle: 'rgba(255,255,255,0.12)',
            accent: '#a855f7',
            accentMid: '#7c3aed',
            accentDim: 'rgba(168,85,247,0.15)',
            accentGlow: 'rgba(168,85,247,0.08)',
            cellBg: 'rgba(255,255,255,0.05)',
            cellFilled: 'rgba(168,85,247,0.2)',
            cellBorder: 'rgba(168,85,247,0.18)',
            cellActive: '#a855f7',
            errorBg: 'rgba(239,68,68,0.12)',
            errorText: '#fca5a5',
        };

        const [code, setCode] = useState('');
        const [focused, setFocused] = useState(false);
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState('');

        const inputRef = useRef<TextInput>(null);
        const shakeX = useRef(new Animated.Value(0)).current;
        const cellScales = useRef(
            Array.from({ length: CODE_LENGTH }, () => new Animated.Value(1))
        ).current;

        // Animate cell pop when character is typed
        useEffect(() => {
            const idx = code.length - 1;
            if (idx >= 0 && idx < CODE_LENGTH) {
                Animated.sequence([
                    Animated.timing(cellScales[idx], { toValue: 1.12, duration: 80, useNativeDriver: true }),
                    Animated.spring(cellScales[idx], { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
                ]).start();
            }
        }, [code]);

        const playShake = () => {
            Animated.sequence([
                Animated.timing(shakeX, { toValue: -8, duration: 50, useNativeDriver: true }),
                Animated.timing(shakeX, { toValue: 8, duration: 50, useNativeDriver: true }),
                Animated.timing(shakeX, { toValue: -5, duration: 50, useNativeDriver: true }),
                Animated.timing(shakeX, { toValue: 5, duration: 50, useNativeDriver: true }),
                Animated.timing(shakeX, { toValue: 0, duration: 50, useNativeDriver: true }),
            ]).start();
        };

        const renderBackdrop = useCallback(
            (props: BottomSheetBackdropProps) => (
                <BottomSheetBackdrop
                    {...props}
                    appearsOnIndex={0}
                    disappearsOnIndex={-1}
                    opacity={0.85}
                />
            ), []
        );

        const handleChange = (val: string) => {
            const clean = val.slice(0, CODE_LENGTH);
            setCode(clean);
            if (error) setError('');
        };

        const handleSubmit = async () => {
            if (code.length < CODE_LENGTH) {
                Vibration.vibrate([0, 40, 60, 40]);
                setError(`Enter all ${CODE_LENGTH} characters`);
                playShake();
                return;
            }
            Keyboard.dismiss();
            setLoading(true);
            setError('');
            try {
                await onSubmit(code);
            } catch (e: any) {
                const serverError = e?.response?.data?.error;
                const detail = e?.response?.data?.detail;

                let msg = 'Invalid invite code. Try again.';

                if (serverError === 'invalid_invite_code') {
                    msg = 'Invalid or expired invite code';
                } else if (serverError === 'invite_code_required') {
                    msg = 'Invite code is required';
                } else if (detail) {
                    msg = detail;
                } else if (!e?.response) {
                    msg = 'Network error. Check your connection.';
                }

                setError(msg);
                Vibration.vibrate([0, 30, 50, 30]);
                playShake();
            } finally {
                setLoading(false);
            }
        };

        const isReady = code.length === CODE_LENGTH && !loading;

        return (
            <BottomSheetModal
                ref={ref}
                snapPoints={['62%']}
                enablePanDownToClose
                backdropComponent={renderBackdrop}
                handleIndicatorStyle={{ backgroundColor: c.handle, width: 36 }}
                backgroundStyle={{ backgroundColor: c.bg }}
                keyboardBehavior="interactive"
                keyboardBlurBehavior="restore"
            >
                <BottomSheetView style={styles.container}>

                    {/* Gradient accent line */}
                    <LinearGradient
                        colors={['#a855f7', '#7c3aed', 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.topLine}
                    />

                    {/* Icon */}
                    <View style={styles.iconBlock}>
                        <LinearGradient
                            colors={['#a855f7', '#6d28d9']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.iconGradient}
                        >
                            <Ticket size={26} color="#fff" strokeWidth={1.8} />
                        </LinearGradient>
                    </View>

                    {/* Title block */}
                    <View style={styles.textBlock}>
                        <Text style={[styles.title, { color: c.text }]}>Invite Only</Text>
                        <Text style={[styles.subtitle, { color: c.sub }]}>
                            NextVibe is in closed beta.{'\n'}Enter your invite code to get in.
                        </Text>
                    </View>

                    {/* OTP cells */}
                    <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => inputRef.current?.focus()}
                            style={styles.cellsRow}
                        >
                            {Array.from({ length: CODE_LENGTH }).map((_, i) => {
                                const char = code[i] ?? '';
                                const isCurrent = focused && i === code.length;
                                const isFilled = i < code.length;

                                return (
                                    <Animated.View
                                        key={i}
                                        style={[
                                            styles.cell,
                                            {
                                                backgroundColor: isFilled ? c.cellFilled : c.cellBg,
                                                borderColor: isCurrent
                                                    ? c.cellActive
                                                    : isFilled
                                                        ? 'rgba(168,85,247,0.5)'
                                                        : c.cellBorder,
                                                borderWidth: isCurrent ? 1.5 : 1,
                                                transform: [{ scale: cellScales[i] }],
                                            },
                                        ]}
                                    >
                                        {isCurrent && !char ? (
                                            <View style={[styles.cursor, { backgroundColor: c.accent }]} />
                                        ) : (
                                            <Text style={[styles.cellText, {
                                                color: isFilled ? c.text : 'transparent',
                                            }]}>
                                                {char || '·'}
                                            </Text>
                                        )}
                                    </Animated.View>
                                );
                            })}
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Hidden input */}
                    <TextInput
                        ref={inputRef}
                        value={code}
                        onChangeText={handleChange}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={CODE_LENGTH}
                        editable={!loading}
                        style={styles.hiddenInput}
                        caretHidden
                    />

                    {/* Error */}
                    {!!error && (
                        <View style={[styles.errorCard, { backgroundColor: c.errorBg }]}>
                            <AlertCircle size={14} color={c.errorText} />
                            <Text style={[styles.errorMsg, { color: c.errorText }]} numberOfLines={2}>
                                {error}
                            </Text>
                        </View>
                    )}

                    <View style={{ flex: 1 }} />

                    {/* Submit */}
                    <TouchableOpacity
                        onPress={handleSubmit}
                        disabled={!isReady}
                        activeOpacity={0.8}
                        style={[styles.submitWrap, { opacity: isReady ? 1 : 0.35 }]}
                    >
                        <LinearGradient
                            colors={['#a855f7', '#7c3aed', '#5b21b6']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.submitBtn}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <View style={styles.submitInner}>
                                    <Text style={styles.submitText}>Join NextVibe</Text>
                                    <ArrowRight size={18} color="#fff" strokeWidth={2} />
                                </View>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                </BottomSheetView>
            </BottomSheetModal>
        );
    }
);

const CELL_SIZE = 48;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 28,
        paddingBottom: 44,
        paddingTop: 8,
    },
    topLine: {
        height: 2,
        borderRadius: 1,
        marginBottom: 28,
    },
    iconBlock: {
        alignItems: 'center',
        marginBottom: 20,
    },
    iconGradient: {
        width: 64,
        height: 64,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    textBlock: {
        alignItems: 'center',
        marginBottom: 32,
        gap: 8,
    },
    title: {
        fontSize: 26,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        letterSpacing: -0.6,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
        lineHeight: 20,
        textAlign: 'center',
    },
    cellsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 20,
    },
    cell: {
        width: CELL_SIZE,
        height: CELL_SIZE + 8,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cellText: {
        fontSize: 24,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    cursor: {
        width: 2,
        height: 24,
        borderRadius: 1,
    },
    hiddenInput: {
        position: 'absolute',
        opacity: 0,
        width: 1,
        height: 1,
    },
    errorCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 13,
        gap: 10,
        marginTop: 4,
    },
    errorMsg: {
        fontSize: 13,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
        flex: 1,
    },
    submitWrap: {
        borderRadius: 20,
        overflow: 'hidden',
    },
    submitBtn: {
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    submitText: {
        fontSize: 16,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        color: '#ffffff',
        letterSpacing: 0.2,
    },
});

export default InviteCodeSheet;