import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, AppState, BackHandler, Linking, Pressable, StatusBar, StyleSheet, Text, View,
    useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraFormat } from 'react-native-vision-camera';
import { Image } from 'expo-image';
import { Camera as CameraIcon, RotateCcw, Send, X } from 'lucide-react-native';
import EventCta from '@/components/Events/EventCta';
import MeetCardPreview from '@/components/Meet/MeetCardPreview';
import {
    cancelMeetPhoto, lockMeetPhoto, MeetPhotoApiError, sendMeetPhoto, uploadMeetPhoto, type MeetPhotoState,
} from '@/src/api/meetPhoto';
import { focusMeetPhoto, openMeetPhotoSheet } from '@/src/stores/meetPhotoStore';
import { safeBack } from '@/src/utils/safeBack';
import haptics from '@/src/utils/haptics';
import { track } from '@/src/utils/analytics';
import { colors, radius, space, type as typeScale } from '@/src/theme/tokens';

type Phase = 'camera' | 'checking' | 'preview' | 'sending' | 'locked';

/** The server's lock lasts 3 minutes; the screen renews it while it's open. */
const LOCK_RENEW_MS = 60_000;
const BG = '#0A0410';

/**
 * The shared selfie at a tap: front camera, both people in the frame. The
 * server strips the photo's metadata, checks it and draws the NextVibe layer;
 * the preview here is that exact render, the one the other person approves
 * and that gets published. Opened after locking the meet (the tap screens),
 * so only one of the two phones has the camera open. Leaving without sending
 * discards the photo and frees the meet for the other phone.
 */
export default function MeetSelfieScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const isFocused = useIsFocused();
    const { width } = useWindowDimensions();
    const params = useLocalSearchParams<{ slug?: string; other?: string }>();
    const slug = typeof params.slug === 'string' ? params.slug : '';
    const [otherName, setOtherName] = useState(typeof params.other === 'string' ? params.other : '');

    const cameraRef = useRef<Camera>(null);
    const device = useCameraDevice('front');
    const format = useCameraFormat(device, [{ photoResolution: { width: 2048, height: 1536 } }]);
    const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
    const [appActive, setAppActive] = useState(AppState.currentState === 'active');

    const [phase, setPhase] = useState<Phase>('camera');
    const [shot, setShot] = useState<string | null>(null);
    const [state, setState] = useState<MeetPhotoState | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [lockedBy, setLockedBy] = useState<string | null>(null);
    const sentRef = useRef(false);

    const draft = state?.photo && state.photo.status === 'draft' && state.photo.role === 'photographer' ? state.photo : null;
    const other = otherName || state?.other.username || 'them';

    // The global photo sheet stays away while this screen shows the meet
    const releaseFocus = useRef<(() => void) | null>(null);
    useEffect(() => {
        if (!slug) return;
        releaseFocus.current = focusMeetPhoto(slug);
        return () => releaseFocus.current?.();
    }, [slug]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => setAppActive(next === 'active'));
        return () => sub.remove();
    }, []);

    useEffect(() => {
        Camera.requestCameraPermission()
            .then((result) => setPermission(result === 'granted' ? 'granted' : 'denied'))
            .catch(() => setPermission('denied'));
    }, []);

    const applyError = useCallback((error: unknown) => {
        const err = error as MeetPhotoApiError;
        if (err.code === 'LOCKED') {
            setLockedBy(err.extra?.photographer ?? other);
            setPhase('locked');
            return;
        }
        setMessage(err.message || 'Something went wrong. Try again.');
    }, [other]);

    // Keep the meet locked while the camera or the preview is open
    useEffect(() => {
        if (!slug || phase === 'locked' || phase === 'sending') return;
        const renew = () => lockMeetPhoto(slug)
            .then((next) => {
                setState((prev) => prev ?? next);
                if (next.other?.username) setOtherName(next.other.username);
            })
            .catch(applyError);
        renew();
        const timer = setInterval(renew, LOCK_RENEW_MS);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug, phase === 'locked', phase === 'sending']);

    const leave = useCallback(() => {
        if (!sentRef.current && slug && phase !== 'locked') {
            cancelMeetPhoto(slug).catch(() => {});
        }
        safeBack(router);
    }, [slug, phase, router]);

    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (phase === 'checking' || phase === 'sending') return true;
            leave();
            return true;
        });
        return () => sub.remove();
    }, [phase, leave]);

    const capture = async () => {
        if (!cameraRef.current || phase !== 'camera') return;
        setMessage(null);
        try {
            haptics.impact('medium');
            const photo = await cameraRef.current.takePhoto({ flash: 'off', enableShutterSound: false });
            setShot(photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`);
            setPhase('checking');
            const next = await uploadMeetPhoto(slug, photo.path);
            setState(next);
            setPhase('preview');
            haptics.notification('success');
            track('meet_selfie_uploaded', { retakes_left: next.photo?.retakes_left ?? 0 });
        } catch (error) {
            haptics.notification('error');
            applyError(error);
            setPhase((current) => (current === 'locked' ? current : draft ? 'preview' : 'camera'));
            setShot(null);
        }
    };

    const retake = () => {
        haptics.selection();
        setMessage(null);
        setShot(null);
        setPhase('camera');
    };

    const send = async () => {
        if (!draft) return;
        setPhase('sending');
        setMessage(null);
        try {
            await sendMeetPhoto(slug);
            sentRef.current = true;
            haptics.notification('success');
            track('meet_selfie_sent');
            releaseFocus.current?.();
            safeBack(router);
            // The photo sheet takes over: waiting for the other person's answer
            setTimeout(() => openMeetPhotoSheet(slug, 'tap'), 350);
        } catch (error) {
            haptics.notification('error');
            applyError(error);
            setPhase((current) => (current === 'locked' ? current : 'preview'));
        }
    };

    const canRetake = !!draft && draft.retakes_left > 0 && (state?.uploads_left ?? 0) > 0;
    const previewWidth = Math.min(width - 2 * space.xl, 420);

    const header = (
        <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
            <Pressable
                onPress={leave}
                disabled={phase === 'checking' || phase === 'sending'}
                hitSlop={12}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Close"
            >
                <X size={22} color={colors.text} strokeWidth={1.8} />
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>
                {phase === 'preview' || phase === 'sending' ? 'Your Proof of Meet' : `Selfie with @${other}`}
            </Text>
            <View style={styles.iconButton} />
        </View>
    );

    if (!slug) {
        return (
            <View style={[styles.root, styles.center]}>
                <Text style={styles.title}>This meet isn't available</Text>
                <View style={styles.actionsNarrow}><EventCta label="Close" onPress={() => safeBack(router)} /></View>
            </View>
        );
    }

    if (phase === 'locked') {
        return (
            <View style={styles.root}>
                <StatusBar barStyle="light-content" />
                {header}
                <View style={styles.center}>
                    <View style={styles.bigIcon}><CameraIcon size={34} color={colors.accent} /></View>
                    <Text style={styles.title}>@{lockedBy ?? other} is taking the photo…</Text>
                    <Text style={styles.body}>You'll get it on your phone to approve.</Text>
                    <View style={styles.actionsNarrow}><EventCta label="OK" onPress={() => safeBack(router)} /></View>
                </View>
            </View>
        );
    }

    if (phase === 'preview' || phase === 'sending') {
        return (
            <View style={styles.root}>
                <StatusBar barStyle="light-content" />
                {header}
                <View style={styles.previewBody}>
                    <MeetCardPreview
                        uri={draft?.preview_url ?? null}
                        width={previewWidth}
                        accessibilityLabel={`Your selfie with @${other}, with the Proof of Meet details on it`}
                    />
                    <Text style={styles.body}>
                        @{other} sees exactly this. If you both approve, it's minted for both of you and posted on both profiles.
                    </Text>
                    {message && <Text style={styles.error} accessibilityLiveRegion="polite">{message}</Text>}
                </View>
                <View style={[styles.actionsRow, { paddingBottom: insets.bottom + space.lg }]}>
                    {canRetake && (
                        <View style={styles.flex}>
                            <EventCta
                                label={`Retake (${Math.min(draft!.retakes_left, state!.uploads_left)} left)`}
                                variant="secondary"
                                icon={<RotateCcw size={16} color={colors.text} />}
                                onPress={retake}
                                disabled={phase === 'sending'}
                            />
                        </View>
                    )}
                    <View style={styles.flex}>
                        <EventCta
                            label={`Send to @${other}`}
                            icon={<Send size={16} color="#fff" />}
                            onPress={send}
                            busy={phase === 'sending'}
                        />
                    </View>
                </View>
            </View>
        );
    }

    // camera / checking
    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor={BG} translucent />
            {permission === 'granted' && device ? (
                <Camera
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    device={device}
                    format={format}
                    isActive={isFocused && appActive && phase === 'camera'}
                    photo
                    video={false}
                    audio={false}
                    photoQualityBalance="balanced"
                    resizeMode="cover"
                />
            ) : null}
            {shot && <Image source={{ uri: shot }} style={StyleSheet.absoluteFill} contentFit="cover" />}
            <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />
            {header}

            {permission === 'denied' ? (
                <View style={styles.center}>
                    <Text style={styles.title}>Camera access needed</Text>
                    <Text style={styles.body}>Allow the camera to take a selfie with @{other}.</Text>
                    <View style={styles.actionsNarrow}>
                        <EventCta label="Open Settings" onPress={() => Linking.openSettings().catch(() => {})} />
                        <EventCta label="Not now" variant="ghost" onPress={leave} />
                    </View>
                </View>
            ) : permission === 'granted' && !device ? (
                <View style={styles.center}>
                    <Text style={styles.title}>No front camera</Text>
                    <Text style={styles.body}>This phone has no camera for a selfie.</Text>
                    <View style={styles.actionsNarrow}><EventCta label="Close" onPress={leave} /></View>
                </View>
            ) : (
                <>
                    <View style={styles.guideWrap} pointerEvents="none">
                        <View style={[styles.guide, { width: width - 2 * space.xl, height: (width - 2 * space.xl) * 1.1 }]} />
                        <Text style={styles.hint}>
                            {phase === 'checking' ? 'Checking the photo…' : 'Get both of you in the frame'}
                        </Text>
                    </View>
                    {message && (
                        <View style={styles.messageWrap}>
                            <Text style={styles.error} accessibilityLiveRegion="polite">{message}</Text>
                        </View>
                    )}
                    <View style={[styles.shutterRow, { paddingBottom: insets.bottom + space.xl }]}>
                        {phase === 'checking' ? (
                            <View style={styles.shutterOuter}><ActivityIndicator color="#fff" /></View>
                        ) : (
                            <Pressable
                                onPress={capture}
                                disabled={permission !== 'granted'}
                                style={({ pressed }) => [styles.shutterOuter, pressed && { transform: [{ scale: 0.92 }] }]}
                                accessibilityRole="button"
                                accessibilityLabel="Take the photo"
                            >
                                <View style={styles.shutterInner} />
                            </Pressable>
                        )}
                    </View>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: BG,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.xl,
        gap: space.sm,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.lg,
        paddingBottom: space.sm,
        zIndex: 2,
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        color: colors.text,
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.body,
        includeFontPadding: false,
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    scrim: {
        backgroundColor: 'rgba(10,4,16,0.12)',
    },
    guideWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.md,
    },
    guide: {
        borderRadius: radius.xl,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.55)',
        borderStyle: 'dashed',
    },
    hint: {
        color: '#fff',
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.sub,
        textAlign: 'center',
        paddingHorizontal: space.md,
        paddingVertical: space.xs,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(10,4,16,0.55)',
        overflow: 'hidden',
        includeFontPadding: false,
    },
    messageWrap: {
        alignItems: 'center',
        paddingHorizontal: space.xl,
        marginBottom: space.md,
    },
    shutterRow: {
        alignItems: 'center',
        paddingTop: space.md,
    },
    shutterOuter: {
        width: 78,
        height: 78,
        borderRadius: 39,
        borderWidth: 4,
        borderColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    shutterInner: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#fff',
    },
    previewBody: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.xl,
        gap: space.md,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: space.md,
        paddingHorizontal: space.xl,
        paddingTop: space.md,
    },
    actionsNarrow: {
        width: '100%',
        gap: space.sm,
        marginTop: space.lg,
    },
    flex: {
        flex: 1,
    },
    bigIcon: {
        width: 76,
        height: 76,
        borderRadius: 38,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(168,85,247,0.16)',
        marginBottom: space.md,
    },
    title: {
        color: colors.text,
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.h2,
        textAlign: 'center',
        includeFontPadding: false,
    },
    body: {
        color: colors.sub,
        fontFamily: 'Dank Mono',
        fontSize: typeScale.sub,
        lineHeight: typeScale.sub + 6,
        textAlign: 'center',
        includeFontPadding: false,
    },
    error: {
        color: '#FCA5A5',
        fontFamily: 'Dank Mono',
        fontSize: typeScale.sub,
        lineHeight: typeScale.sub + 6,
        textAlign: 'center',
        includeFontPadding: false,
    },
});
