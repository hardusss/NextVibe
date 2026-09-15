import React, { useEffect, useRef, useState } from 'react';
import {
    AccessibilityInfo,
    Animated,
    Easing,
    Linking,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
    useColorScheme,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertTriangle, Info, Newspaper, Radio, ShieldX, Sparkles, Users, Wallet } from 'lucide-react-native';
import EventCta from '@/components/Events/EventCta';
import UserBadges from '@/components/Shared/UserBadges';
import SuccessBurst from '@/components/NftClaim/MintBottomSheet/SuccessBurst';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { subscribeProximityLinks } from '@/src/proximity/linkQueue';
import { useProximityPrompt } from '@/src/proximity/promptStore';
import { space, radius, colors, type as typeScale } from '@/src/theme/tokens';

type Snapshot = Pick<
    ReturnType<typeof useProximityPrompt.getState>,
    'phase' | 'kind' | 'mode' | 'peer' | 'points' | 'error' | 'payload'
>;

const SHEET_OFFSET = 420;

function shortAddress(address?: string) {
    if (!address) return '';
    return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

/**
 * Global receive sheet for every tap (Bluetooth, NFC tag, link). Mounted once
 * in the root layout; state lives in src/proximity/promptStore.
 */
export default function ProximityPrompt() {
    const router = useRouter();
    const pathname = usePathname();
    const insets = useSafeAreaInsets();
    const isDark = useColorScheme() === 'dark';
    const reduceMotion = useReduceMotion();

    const visible = useProximityPrompt((s) => s.visible);
    const phase = useProximityPrompt((s) => s.phase);
    const kind = useProximityPrompt((s) => s.kind);
    const mode = useProximityPrompt((s) => s.mode);
    const peer = useProximityPrompt((s) => s.peer);
    const points = useProximityPrompt((s) => s.points);
    const error = useProximityPrompt((s) => s.error);
    const payload = useProximityPrompt((s) => s.payload);
    const navigation = useProximityPrompt((s) => s.navigation);

    // Keep showing the last content while the sheet animates out.
    const [snapshot, setSnapshot] = useState<Snapshot>({ phase, kind, mode, peer, points, error, payload });
    const [mounted, setMounted] = useState(false);
    const translateY = useRef(new Animated.Value(SHEET_OFFSET)).current;
    const backdrop = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) setSnapshot({ phase, kind, mode, peer, points, error, payload });
    }, [visible, phase, kind, mode, peer, points, error, payload]);

    // OS-delivered tap links (NFC tag read, universal/app link).
    useEffect(() => subscribeProximityLinks((url) => {
        useProximityPrompt.getState().handle(url, 'link');
    }), []);

    // Deferred navigation (check-in result, profile, payment) — wait until
    // the splash/redirect dance of a cold start is over.
    useEffect(() => {
        if (!navigation) return;
        if (!pathname || pathname === '/' || pathname === '/splash') return;
        const nav = useProximityPrompt.getState().takeNavigation();
        if (!nav) return;
        try {
            router.push((nav.params ? { pathname: nav.pathname, params: nav.params } : nav.pathname) as any);
        } catch {
            // An unmatched legacy path — nothing sensible to open.
        }
    }, [navigation, pathname, router]);

    useEffect(() => {
        if (visible) {
            setMounted(true);
            translateY.setValue(reduceMotion ? 0 : SHEET_OFFSET);
            Animated.parallel([
                reduceMotion
                    ? Animated.timing(translateY, { toValue: 0, duration: 1, useNativeDriver: true })
                    : Animated.spring(translateY, { toValue: 0, damping: 20, stiffness: 190, mass: 0.9, useNativeDriver: true }),
                Animated.timing(backdrop, { toValue: 1, duration: 180, useNativeDriver: true }),
            ]).start();
        } else if (mounted) {
            Animated.parallel([
                Animated.timing(translateY, {
                    toValue: reduceMotion ? 0 : SHEET_OFFSET,
                    duration: 200,
                    easing: Easing.in(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]).start(({ finished }) => {
                if (finished) setMounted(false);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const title = titleFor(snapshot);
    useEffect(() => {
        if (visible && title) AccessibilityInfo.announceForAccessibility?.(title);
    }, [visible, title]);

    if (!mounted) return null;

    const store = useProximityPrompt.getState();
    const close = () => store.close();
    const busy = phase === 'connecting';

    const main = isDark ? colors.text : '#111827';
    const muted = isDark ? colors.sub : 'rgba(17,24,39,0.6)';
    const sheetBg = isDark ? colors.card : '#FFFFFF';

    const onErrorAction = () => {
        const action = snapshot.error?.action;
        if (action === 'openSettings') {
            Linking.openSettings().catch(() => {});
        } else if (action === 'openLocationSettings') {
            if (Platform.OS === 'android') {
                Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings().catch(() => {}));
            } else {
                Linking.openSettings().catch(() => {});
            }
        } else if (action === 'signIn') {
            close();
            router.push('/login' as any);
        }
    };

    const renderAvatar = (withBurst = false) => (
        <View style={styles.avatarWrap}>
            {withBurst && !reduceMotion && <SuccessBurst trigger color={colors.accent} />}
            {snapshot.peer?.avatar ? (
                <Image source={{ uri: snapshot.peer.avatar }} style={styles.avatar} contentFit="cover" />
            ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                    <Users size={34} color={colors.accent} />
                </View>
            )}
        </View>
    );

    const renderBody = () => {
        const s = snapshot;

        if (s.phase === 'loading') {
            return (
                <>
                    <PulseIcon reduceMotion={reduceMotion}>
                        <Radio size={30} color={colors.accent} strokeWidth={1.8} />
                    </PulseIcon>
                    <Text style={[styles.title, { color: main }]}>{title}</Text>
                    <Text style={[styles.message, { color: muted }]}>Checking who it is…</Text>
                    <View style={styles.actions}>
                        <EventCta label="Cancel" variant="ghost" onPress={close} />
                    </View>
                </>
            );
        }

        if (s.phase === 'error' && s.error) {
            const tint = s.error.tone === 'info' ? colors.accent : s.error.tone === 'warning' ? colors.warning : colors.danger;
            const Icon = s.error.tone === 'info' ? Info : s.error.tone === 'warning' ? AlertTriangle : ShieldX;
            const actionLabel = s.error.action === 'openSettings' || s.error.action === 'openLocationSettings'
                ? 'Open Settings'
                : s.error.action === 'signIn' ? 'Sign in' : null;
            return (
                <>
                    <View style={[styles.iconCircle, { backgroundColor: `${tint}1F`, borderColor: `${tint}55` }]}>
                        <Icon size={32} color={tint} strokeWidth={1.8} />
                    </View>
                    <Text style={[styles.title, { color: main }]}>{s.error.title}</Text>
                    <Text style={[styles.message, { color: muted }]}>{s.error.message}</Text>
                    <View style={styles.actions}>
                        {actionLabel && <EventCta label={actionLabel} onPress={onErrorAction} />}
                        {s.error.retryable && (
                            <EventCta
                                label="Try again"
                                variant={actionLabel ? 'secondary' : 'primary'}
                                onPress={() => store.retry()}
                            />
                        )}
                        <EventCta
                            label={s.error.tone === 'info' ? 'OK' : 'Close'}
                            variant={actionLabel || s.error.retryable ? 'ghost' : 'primary'}
                            onPress={close}
                        />
                    </View>
                </>
            );
        }

        if (s.phase === 'success') {
            return (
                <>
                    {renderAvatar(true)}
                    <View style={styles.nameRow}>
                        <Text style={[styles.title, styles.titleInRow, { color: main }]} numberOfLines={1}>
                            You met @{s.peer?.username ?? 'them'}
                        </Text>
                        <UserBadges official={s.peer?.is_official} seekerVerified={s.peer?.is_seeker_verified} size={20} />
                    </View>
                    {s.points > 0 && (
                        <LinearGradient
                            colors={[colors.accent, colors.accentDeep]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.repPill}
                        >
                            <Sparkles size={16} color="#fff" strokeWidth={2} />
                            <Text style={styles.repText}>+{s.points} REP</Text>
                        </LinearGradient>
                    )}
                    <Text style={[styles.message, { color: muted }]}>Reputation added for both of you.</Text>
                    <View style={styles.actions}>
                        <EventCta label="Done" onPress={close} />
                    </View>
                </>
            );
        }

        // confirm / connecting
        if (s.kind === 'meet') {
            const isIrl = s.mode === 'irl';
            const name = s.peer?.username ? `@${s.peer.username}` : 'them';
            const message = isIrl
                ? (s.points > 0
                    ? `Confirm you met in person — you'll both get +${s.points} REP.`
                    : 'Confirm you met in person.')
                : (s.points > 0
                    ? `Confirm you connected at the event — you'll both get +${s.points} REP.`
                    : 'Confirm you connected at the event.');
            return (
                <>
                    {renderAvatar()}
                    <View style={[styles.modeChip, { borderColor: isDark ? colors.border : 'rgba(0,0,0,0.08)' }]}>
                        <Text style={[styles.modeChipText, { color: muted }]}>
                            {isIrl ? 'In person · not at an event' : 'Event networking'}
                        </Text>
                    </View>
                    <View style={styles.nameRow}>
                        <Text style={[styles.title, styles.titleInRow, { color: main }]} numberOfLines={1}>
                            Meet {name}?
                        </Text>
                        <UserBadges official={s.peer?.is_official} seekerVerified={s.peer?.is_seeker_verified} size={20} />
                    </View>
                    <Text style={[styles.message, { color: muted }]}>{message}</Text>
                    <View style={styles.actionsRow}>
                        <View style={styles.flex}>
                            <EventCta label="Not now" variant="secondary" onPress={close} disabled={busy} />
                        </View>
                        <View style={styles.flex}>
                            <EventCta label="Confirm" onPress={() => store.confirm()} busy={busy} />
                        </View>
                    </View>
                </>
            );
        }

        if (s.kind === 'profile') {
            return (
                <>
                    {renderAvatar()}
                    <View style={styles.nameRow}>
                        <Text style={[styles.title, styles.titleInRow, { color: main }]} numberOfLines={1}>
                            @{s.peer?.username ?? 'someone'}
                        </Text>
                        <UserBadges official={s.peer?.is_official} seekerVerified={s.peer?.is_seeker_verified} size={20} />
                    </View>
                    <Text style={[styles.message, { color: muted }]}>shared their profile with you.</Text>
                    <View style={styles.actionsRow}>
                        <View style={styles.flex}>
                            <EventCta label="Close" variant="secondary" onPress={close} />
                        </View>
                        <View style={styles.flex}>
                            <EventCta label="View profile" onPress={() => store.confirm()} />
                        </View>
                    </View>
                </>
            );
        }

        const isPayment = s.kind === 'payment' && s.payload?.kind === 'payment';
        const paymentPayload = s.payload?.kind === 'payment' ? s.payload : null;
        return (
            <>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(168,85,247,0.12)', borderColor: 'rgba(168,85,247,0.3)' }]}>
                    {isPayment
                        ? <Wallet size={30} color={colors.accent} strokeWidth={1.8} />
                        : <Newspaper size={30} color={colors.accent} strokeWidth={1.8} />}
                </View>
                <Text style={[styles.title, { color: main }]}>{title}</Text>
                <Text style={[styles.message, { color: muted }]}>
                    {paymentPayload
                        ? [
                            paymentPayload.amount && paymentPayload.tokenSymbol
                                ? `${paymentPayload.amount} ${paymentPayload.tokenSymbol}`
                                : null,
                            paymentPayload.address ? `to ${shortAddress(paymentPayload.address)}` : null,
                        ].filter(Boolean).join(' ') || 'Review the request before sending.'
                        : 'Someone nearby shared a post with you.'}
                </Text>
                <View style={styles.actionsRow}>
                    <View style={styles.flex}>
                        <EventCta label="Close" variant="secondary" onPress={close} />
                    </View>
                    <View style={styles.flex}>
                        <EventCta label={isPayment ? 'Review' : 'Open'} onPress={() => store.confirm()} />
                    </View>
                </View>
            </>
        );
    };

    const dismissible = phase !== 'connecting';

    const layers = (
        <>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdrop }]}>
                <BlurView style={StyleSheet.absoluteFill} tint={isDark ? 'dark' : 'light'} intensity={20} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => { if (dismissible) close(); }}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss"
                />
            </Animated.View>

            <View style={styles.anchor} pointerEvents="box-none">
                <Animated.View
                    accessibilityViewIsModal
                    style={[
                        styles.sheet,
                        {
                            backgroundColor: sheetBg,
                            borderColor: isDark ? 'rgba(168,85,247,0.22)' : 'rgba(0,0,0,0.06)',
                            paddingBottom: insets.bottom + space.lg,
                            transform: [{ translateY }],
                        },
                    ]}
                >
                    <LinearGradient
                        colors={[colors.accent, colors.accentDeep]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.topLine}
                    />
                    <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }]} />
                    <View style={styles.body}>{renderBody()}</View>
                </Animated.View>
            </View>
        </>
    );

    if (Platform.OS === 'ios') {
        // A React Native <Modal> presents from the root view controller, and
        // UIKit refuses that while a native-stack modal (check-in, Tap to Meet
        // opened from it, deposit…) is on screen — the sheet silently never
        // appeared. A full-window overlay sits above every presented screen.
        return (
            <FullWindowOverlay>
                <View style={StyleSheet.absoluteFill}>{layers}</View>
            </FullWindowOverlay>
        );
    }

    return (
        <Modal
            visible
            transparent
            animationType="none"
            statusBarTranslucent
            navigationBarTranslucent
            onRequestClose={() => { if (dismissible) close(); }}
        >
            {layers}
        </Modal>
    );
}

function titleFor(s: Snapshot): string {
    if (s.phase === 'loading') return 'Phone detected';
    if (s.phase === 'error') return s.error?.title ?? '';
    if (s.phase === 'success') return `You met @${s.peer?.username ?? 'them'}`;
    if (s.kind === 'meet') return `Meet @${s.peer?.username ?? 'them'}?`;
    if (s.kind === 'profile') return `@${s.peer?.username ?? 'someone'} shared their profile`;
    if (s.kind === 'payment') return 'Payment request';
    return 'Post shared with you';
}

function PulseIcon({ children, reduceMotion }: { children: React.ReactNode; reduceMotion: boolean }) {
    const scale = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        if (reduceMotion) return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(scale, { toValue: 1.08, duration: 700, useNativeDriver: true }),
                Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [reduceMotion, scale]);
    return (
        <Animated.View
            style={[
                styles.iconCircle,
                { backgroundColor: 'rgba(168,85,247,0.12)', borderColor: 'rgba(168,85,247,0.3)', transform: [{ scale }] },
            ]}
        >
            {children}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    anchor: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        borderWidth: 1,
        borderBottomWidth: 0,
        overflow: 'hidden',
    },
    topLine: {
        height: 3,
        width: '100%',
    },
    handle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        marginTop: space.sm,
    },
    body: {
        alignItems: 'center',
        paddingHorizontal: space.xl,
        paddingTop: space.lg,
    },
    avatarWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: space.md,
    },
    avatar: {
        width: 88,
        height: 88,
        borderRadius: 44,
        borderWidth: 3,
        borderColor: colors.accent,
    },
    avatarFallback: {
        backgroundColor: 'rgba(168,85,247,0.16)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: space.md,
    },
    modeChip: {
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingHorizontal: space.md,
        paddingVertical: 4,
        marginBottom: space.sm,
    },
    modeChipText: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        includeFontPadding: false,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        maxWidth: '100%',
        gap: 4,
    },
    title: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.h2,
        lineHeight: typeScale.h2 + 4,
        textAlign: 'center',
        includeFontPadding: false,
    },
    titleInRow: {
        flexShrink: 1,
    },
    message: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.sub,
        lineHeight: typeScale.sub + 6,
        textAlign: 'center',
        marginTop: space.sm,
        paddingHorizontal: space.sm,
        includeFontPadding: false,
    },
    repPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.lg,
        paddingVertical: space.sm,
        borderRadius: radius.pill,
        marginTop: space.md,
    },
    repText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.body,
        color: '#fff',
        includeFontPadding: false,
    },
    actions: {
        width: '100%',
        gap: space.sm,
        marginTop: space.xl,
    },
    actionsRow: {
        width: '100%',
        flexDirection: 'row',
        gap: space.md,
        marginTop: space.xl,
    },
    flex: {
        flex: 1,
    },
});
