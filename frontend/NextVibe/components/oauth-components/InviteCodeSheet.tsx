import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Pressable, ActivityIndicator,
    Keyboard, Animated, Platform, useWindowDimensions,
    type KeyboardEvent,
} from 'react-native';
import {
    BottomSheetModal,
    BottomSheetScrollView,
    BottomSheetTextInput,
    BottomSheetBackdrop,
    BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { Ticket, AlertCircle, ArrowRight } from 'lucide-react-native';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import haptics from '@/src/utils/haptics';
import { HIT_TARGET, space, type as typeScale } from '@/src/theme/tokens';

const CODE_LENGTH = 6;
/** The sheet never grows past this share of the window... */
const MAX_HEIGHT_RATIO = 0.9;
/** ...and never shrinks below this, however tall the keyboard is. */
const MIN_SHEET_HEIGHT = 200;

const c = {
    bg: '#110a1e',
    text: '#f0e6ff',
    sub: '#9d8cbd',
    skip: '#c4b5fd',
    handle: 'rgba(255,255,255,0.18)',
    accent: '#a855f7',
    cellBg: 'rgba(255,255,255,0.05)',
    cellFilled: 'rgba(168,85,247,0.2)',
    cellBorder: 'rgba(168,85,247,0.18)',
    cellBorderFilled: 'rgba(168,85,247,0.5)',
    errorBg: 'rgba(239,68,68,0.12)',
    errorText: '#fca5a5',
};

interface InviteCodeSheetProps {
    /**
     * Finishes sign-up. `code` is the 6-character invite code, or '' when
     * the person skips: either Skip button, a drag down, a backdrop tap or
     * Android back. Resolve once signed in, throw to show the error here.
     */
    onSubmit: (code: string) => Promise<void>;
}

function errorMessage(e: any): string {
    const data = e?.response?.data;
    if (data?.error === 'invalid_invite_code') return 'Invalid invite code. Check it and try again, or skip.';
    if (typeof data?.detail === 'string' && data.detail) return data.detail;
    if (!e?.response) return 'Network error. Check your connection.';
    return 'Something went wrong. Please try again.';
}

/** Height of the on-screen keyboard, 0 while it's hidden. */
function useKeyboardHeight(): number {
    const [height, setHeight] = useState(() => (Keyboard.isVisible() ? Keyboard.metrics()?.height ?? 0 : 0));
    useEffect(() => {
        const show = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            (e: KeyboardEvent) => setHeight(e.endCoordinates.height),
        );
        const hide = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            () => setHeight(0),
        );
        return () => {
            show.remove();
            hide.remove();
        };
    }, []);
    return height;
}

/**
 * Optional invite code after a first Apple / Google / wallet sign-in.
 * Skip is always on screen: in the sheet header (outside the scroll area,
 * so it stays put while the keyboard is up) and under the Join button.
 * The sheet sizes to its content, capped at 90% of the window and at the
 * space above the keyboard; anything that doesn't fit scrolls.
 */
const InviteCodeSheet = forwardRef<BottomSheetModal, InviteCodeSheetProps>(
    ({ onSubmit }, ref) => {
        const insets = useSafeAreaInsets();
        const { height: windowHeight } = useWindowDimensions();
        const reduceMotion = useReduceMotion();

        const [open, setOpen] = useState(false);
        const [code, setCode] = useState('');
        const [focused, setFocused] = useState(false);
        const [busy, setBusy] = useState<'join' | 'skip' | null>(null);
        const [error, setError] = useState('');
        const keyboardHeight = useKeyboardHeight();

        const sheetRef = useRef<BottomSheetModal | null>(null);
        const inputRef = useRef<any>(null);
        // A request is in flight: closing the sheet must not start another one.
        const busyRef = useRef(false);
        // Sign-up went through: the sheet is closing for good, not skipping.
        const doneRef = useRef(false);

        const shakeX = useRef(new Animated.Value(0)).current;
        const cellScales = useRef(
            Array.from({ length: CODE_LENGTH }, () => new Animated.Value(1))
        ).current;

        const setRefs = useCallback((node: BottomSheetModal | null) => {
            sheetRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
        }, [ref]);

        // Pop the cell a character was just typed into
        useEffect(() => {
            const idx = code.length - 1;
            if (reduceMotion || idx < 0 || idx >= CODE_LENGTH) return;
            Animated.sequence([
                Animated.timing(cellScales[idx], { toValue: 1.12, duration: 80, useNativeDriver: true }),
                Animated.spring(cellScales[idx], { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
            ]).start();
        }, [code, cellScales, reduceMotion]);

        const showError = (message: string) => {
            setError(message);
            haptics.notification('error');
            if (reduceMotion) return;
            Animated.sequence([
                Animated.timing(shakeX, { toValue: -8, duration: 50, useNativeDriver: true }),
                Animated.timing(shakeX, { toValue: 8, duration: 50, useNativeDriver: true }),
                Animated.timing(shakeX, { toValue: -5, duration: 50, useNativeDriver: true }),
                Animated.timing(shakeX, { toValue: 5, duration: 50, useNativeDriver: true }),
                Animated.timing(shakeX, { toValue: 0, duration: 50, useNativeDriver: true }),
            ]).start();
        };

        const finish = async (value: string) => {
            if (busyRef.current) return;
            busyRef.current = true;
            Keyboard.dismiss();
            setBusy(value ? 'join' : 'skip');
            setError('');
            try {
                await onSubmit(value);
                doneRef.current = true;
                // Callers dismiss on success too; a second dismiss is a no-op.
                sheetRef.current?.dismiss();
            } catch (e) {
                showError(errorMessage(e));
            } finally {
                busyRef.current = false;
                setBusy(null);
            }
        };

        const skip = () => finish('');
        // The header is memoised; it calls the latest skip through this ref.
        const skipRef = useRef(skip);
        skipRef.current = skip;

        const join = () => {
            if (code.length < CODE_LENGTH) {
                showError(`Enter all ${CODE_LENGTH} characters, or skip.`);
                return;
            }
            finish(code);
        };

        const handleChange = (val: string) => {
            const clean = val.replace(/\s+/g, '').slice(0, CODE_LENGTH);
            setCode(clean);
            if (error) setError('');
            // All 6 in: drop the keyboard so Join is in view
            if (clean.length === CODE_LENGTH) Keyboard.dismiss();
        };

        // Any close that didn't come from a finished sign-up counts as Skip,
        // so nobody is left on the sign-in screen without an account.
        const handleDismiss = () => {
            const skipped = !doneRef.current && !busyRef.current;
            doneRef.current = false;
            setOpen(false);
            setCode('');
            setError('');
            setFocused(false);
            if (!skipped) return;
            busyRef.current = true;
            onSubmit('')
                .catch((e) => Toast.show({
                    type: 'error',
                    text1: "Couldn't finish signing up",
                    text2: errorMessage(e),
                }))
                .finally(() => { busyRef.current = false; });
        };

        const closeSheet = useCallback(() => {
            if (!busyRef.current) sheetRef.current?.dismiss();
        }, []);
        useSheetBackHandler(open, closeSheet);

        const renderBackdrop = useCallback(
            (props: BottomSheetBackdropProps) => (
                <BottomSheetBackdrop
                    {...props}
                    appearsOnIndex={0}
                    disappearsOnIndex={-1}
                    opacity={0.85}
                    pressBehavior={busy ? 'none' : 'close'}
                />
            ), [busy]
        );

        // Header = the drag handle, so it sits above the scroll area and is
        // counted in the sheet's height.
        const renderHeader = useCallback(() => (
            <View style={styles.header}>
                <View style={[styles.grabber, { backgroundColor: c.handle }]} />
                <Pressable
                    onPress={() => skipRef.current()}
                    disabled={!!busy}
                    hitSlop={space.sm}
                    style={styles.headerSkip}
                    accessibilityRole="button"
                    accessibilityLabel="Skip"
                    accessibilityHint="Continue without an invite code"
                    testID="invite-skip-header"
                >
                    <Text style={[styles.skipText, { opacity: busy ? 0.4 : 1 }]}>Skip</Text>
                </Pressable>
            </View>
        ), [busy]);

        const keyboardUp = keyboardHeight > 0;
        const maxSheetHeight = Math.max(
            MIN_SHEET_HEIGHT,
            Math.min(
                Math.round(windowHeight * MAX_HEIGHT_RATIO),
                windowHeight - insets.top - space.sm - keyboardHeight,
            ),
        );
        const isReady = code.length === CODE_LENGTH && !busy;

        return (
            <BottomSheetModal
                ref={setRefs}
                enableDynamicSizing
                maxDynamicContentSize={maxSheetHeight}
                topInset={insets.top}
                enablePanDownToClose={!busy}
                backdropComponent={renderBackdrop}
                handleComponent={renderHeader}
                backgroundStyle={{ backgroundColor: c.bg }}
                keyboardBehavior="interactive"
                keyboardBlurBehavior="restore"
                android_keyboardInputMode="adjustResize"
                onAnimate={(_, toIndex) => { if (toIndex >= 0) setOpen(true); }}
                onDismiss={handleDismiss}
            >
                <BottomSheetScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={[
                        styles.body,
                        // The keyboard covers the home indicator area
                        { paddingBottom: (keyboardUp ? 0 : insets.bottom) + space.lg },
                    ]}
                >
                    <LinearGradient
                        colors={['#a855f7', '#7c3aed', 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.topLine}
                    />

                    {/* Room for both Skips above the keyboard on small phones */}
                    {!keyboardUp && (
                        <View style={styles.iconBlock}>
                            <LinearGradient
                                colors={['#a855f7', '#6d28d9']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.iconGradient}
                            >
                                <Ticket size={24} color="#fff" strokeWidth={1.8} />
                            </LinearGradient>
                        </View>
                    )}

                    <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
                        Have an invite code?
                    </Text>
                    <Text style={[styles.subtitle, { color: c.sub }]}>
                        {"Enter a friend's code to connect with them right away — or skip for now."}
                    </Text>

                    <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
                        <Pressable
                            onPress={() => inputRef.current?.focus()}
                            style={styles.cellsRow}
                            accessibilityRole="button"
                            accessibilityLabel="Enter invite code"
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
                                                    ? c.accent
                                                    : isFilled ? c.cellBorderFilled : c.cellBorder,
                                                borderWidth: isCurrent ? 1.5 : 1,
                                                transform: [{ scale: cellScales[i] }],
                                            },
                                        ]}
                                    >
                                        {isCurrent && !char ? (
                                            <View style={[styles.cursor, { backgroundColor: c.accent }]} />
                                        ) : (
                                            <Text style={[styles.cellText, { color: isFilled ? c.text : 'transparent' }]}>
                                                {char || '·'}
                                            </Text>
                                        )}
                                    </Animated.View>
                                );
                            })}
                        </Pressable>
                    </Animated.View>

                    {/* Hidden input; the sheet follows the keyboard for it */}
                    <BottomSheetTextInput
                        ref={inputRef}
                        value={code}
                        onChangeText={handleChange}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        onSubmitEditing={join}
                        autoCapitalize="characters"
                        // Codes are Latin letters and digits, whatever the keyboard language
                        keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'default'}
                        autoCorrect={false}
                        spellCheck={false}
                        autoComplete="off"
                        returnKeyType={Platform.OS === 'ios' ? 'join' : 'go'}
                        maxLength={CODE_LENGTH}
                        editable={!busy}
                        style={styles.hiddenInput}
                        caretHidden
                        testID="invite-code-input"
                    />

                    {!!error && (
                        <View style={[styles.errorCard, { backgroundColor: c.errorBg }]}>
                            <AlertCircle size={14} color={c.errorText} />
                            <Text style={[styles.errorMsg, { color: c.errorText }]} numberOfLines={3}>
                                {error}
                            </Text>
                        </View>
                    )}

                    <Pressable
                        onPress={join}
                        disabled={!isReady}
                        style={({ pressed }) => [
                            styles.submitWrap,
                            { opacity: busy === 'join' ? 1 : isReady ? (pressed ? 0.8 : 1) : 0.35 },
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !isReady, busy: busy === 'join' }}
                        testID="invite-join"
                    >
                        <LinearGradient
                            colors={['#a855f7', '#7c3aed', '#5b21b6']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.submitBtn}
                        >
                            {busy === 'join' ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <View style={styles.submitInner}>
                                    <Text style={styles.submitText}>Join NextVibe</Text>
                                    <ArrowRight size={18} color="#fff" strokeWidth={2} />
                                </View>
                            )}
                        </LinearGradient>
                    </Pressable>

                    <Pressable
                        onPress={skip}
                        disabled={!!busy}
                        style={styles.skipBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Skip"
                        accessibilityHint="Continue without an invite code"
                        testID="invite-skip"
                    >
                        {busy === 'skip' ? (
                            <ActivityIndicator color={c.skip} size="small" />
                        ) : (
                            <Text style={[styles.skipText, { opacity: busy ? 0.4 : 1 }]}>Skip</Text>
                        )}
                    </Pressable>
                </BottomSheetScrollView>
            </BottomSheetModal>
        );
    }
);

InviteCodeSheet.displayName = 'InviteCodeSheet';

const CELL_HEIGHT = 56;

const styles = StyleSheet.create({
    header: {
        height: HIT_TARGET + space.xs,
        alignItems: 'center',
    },
    grabber: {
        width: 36,
        height: 4,
        borderRadius: 2,
        marginTop: space.sm,
    },
    headerSkip: {
        position: 'absolute',
        right: space.sm,
        top: space.xs,
        minHeight: HIT_TARGET,
        paddingHorizontal: space.md,
        justifyContent: 'center',
    },
    body: {
        paddingHorizontal: space.xl,
        paddingTop: space.xs,
    },
    topLine: {
        height: 2,
        borderRadius: 1,
        marginBottom: space.lg,
    },
    iconBlock: {
        alignItems: 'center',
        marginBottom: space.lg,
    },
    iconGradient: {
        width: 56,
        height: 56,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: typeScale.title,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        letterSpacing: -0.6,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: typeScale.sub,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
        lineHeight: 20,
        textAlign: 'center',
        marginTop: space.sm,
        marginBottom: space.xl,
    },
    cellsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10,
        marginBottom: space.lg,
    },
    cell: {
        flex: 1,
        maxWidth: 48,
        height: CELL_HEIGHT,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cellText: {
        fontSize: typeScale.title,
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
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        gap: 10,
        marginBottom: space.md,
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
        marginTop: space.xs,
    },
    submitBtn: {
        minHeight: 56,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
    },
    submitText: {
        fontSize: typeScale.body,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        color: '#ffffff',
        letterSpacing: 0.2,
    },
    skipBtn: {
        marginTop: space.sm,
        minHeight: HIT_TARGET + space.xs,
        alignItems: 'center',
        justifyContent: 'center',
    },
    skipText: {
        fontSize: typeScale.body,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        color: c.skip,
    },
});

export default InviteCodeSheet;
