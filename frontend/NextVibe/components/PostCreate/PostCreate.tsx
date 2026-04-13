import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    Switch, useColorScheme, Dimensions, ActivityIndicator,
    KeyboardAvoidingView, Platform, Animated, Easing, ScrollView, StatusBar, Vibration
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import createPost from '@/src/api/create.post';
import { getLocationName } from '@/src/api/mapbox/get.coords.name';
import FastImage from 'react-native-fast-image';
import Web3Toast from '../Shared/Toasts/Web3Toast';
import ConfirmDialog from '../Shared/Toasts/ConfirmDialog';
import * as Location from 'expo-location';
import {
    ArrowLeft, MapPin, MessageCircle, CheckCircle2,
    Camera, Send
} from 'lucide-react-native';

const { width, height } = Dimensions.get('window');
const PHOTO_H = height * 0.56;

const dark = {
    bg: '#07030D',
    photoOverlay: ['transparent', '#07030D'] as [string, string],
    photoTopOverlay: ['#07030D', 'transparent'] as [string, string],
    fg: '#EDE8FF',
    fgMid: 'rgba(237,232,255,0.38)',
    fgLow: 'rgba(237,232,255,0.16)',
    sep: 'rgba(237,232,255,0.08)',
    accent: '#A855F7',
    accentDim: 'rgba(168,85,247,0.18)',
    ok: '#34D399',
    okDim: 'rgba(52,211,153,0.14)',
    err: '#F87171',
    inputPh: 'rgba(237,232,255,0.22)',
};
const light = {
    bg: '#F4F0FF',
    photoOverlay: ['transparent', '#F4F0FF'] as [string, string],
    photoTopOverlay: ['#F4F0FF', 'transparent'] as [string, string],
    fg: '#180C34',
    fgMid: 'rgba(24,12,52,0.42)',
    fgLow: 'rgba(24,12,52,0.18)',
    sep: 'rgba(24,12,52,0.08)',
    accent: '#7C3AED',
    accentDim: 'rgba(124,58,237,0.1)',
    ok: '#059669',
    okDim: 'rgba(5,150,105,0.1)',
    err: '#DC2626',
    inputPh: 'rgba(24,12,52,0.28)',
};

const SUCCESS_VIB = [30, 60, 30, 80, 50];
const FAIL_VIB = [150, 70, 50, 200];

const RESOLUTION_LEVELS: { res: 8 | 10 | 12; label: string; sub: string }[] = [
    { res: 12, label: 'exact',    sub: '~10 m' },
    { res: 10, label: 'area',     sub: '~150 m' },
    { res: 8,  label: 'district', sub: '~500 m' },
];

function LocatingDots({ color }: { color: string }) {
    const d0 = useRef(new Animated.Value(0.25)).current;
    const d1 = useRef(new Animated.Value(0.25)).current;
    const d2 = useRef(new Animated.Value(0.25)).current;
    useEffect(() => {
        const pulse = (val: Animated.Value, delay: number) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(val, { toValue: 1, duration: 380, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
                    Animated.timing(val, { toValue: 0.25, duration: 380, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
                    Animated.delay(760 - delay),
                ])
            );
        const a0 = pulse(d0, 0);
        const a1 = pulse(d1, 253);
        const a2 = pulse(d2, 506);
        a0.start(); a1.start(); a2.start();
        return () => { a0.stop(); a1.stop(); a2.stop(); };
    }, []);
    const dot = (val: Animated.Value) => (
        <Animated.View style={{
            width: 5, height: 5, borderRadius: 3,
            backgroundColor: color, opacity: val,
            marginHorizontal: 1.5,
        }} />
    );
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: 32, height: 32 }}>
            {dot(d0)}{dot(d1)}{dot(d2)}
        </View>
    );
}

function VideoPlayer({ uri }: { uri: string }) {
    const video = useRef<Video>(null);
    const [status, setStatus] = useState<AVPlaybackStatus>();
    return (
        <View style={{ flex: 1 }}>
            {!status?.isLoaded && (
                <ActivityIndicator size="large" color="#fff" style={StyleSheet.absoluteFillObject} />
            )}
            <Video
                ref={video} style={{ width: '100%', height: '100%' }}
                source={{ uri }} resizeMode={ResizeMode.COVER}
                isLooping shouldPlay isMuted={false}
                onPlaybackStatusUpdate={s => setStatus(() => s)}
            />
        </View>
    );
}

export default function PostCreate() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const scheme = useColorScheme();
    const c = scheme === 'dark' ? dark : light;

    const rawUrl = (() => {
        try { return typeof params.urls === 'string' ? JSON.parse(params.urls)[0] ?? null : null; }
        catch { return null; }
    })();
    const [mediaUrl] = useState<string | null>(rawUrl);
    const [caption, setCaption] = useState('');
    const [location, setLocation] = useState('');
    const [comments, setComments] = useState(true);
    const [locating, setLocating] = useState(false);
    const [resolution, setResolution] = useState<8 | 10 | 12>(12);
    const [coords, setCoords] = useState<Record<string, number>>({
        lat: 0,
        lng: 0,
    });
    const [toast, setToast] = useState({ visible: false, msg: '', ok: false });
    const [confirm, setConfirm] = useState(false);
    const showToast = (msg: string, ok: boolean) => setToast({ visible: true, msg, ok });

    const photoY = useRef(new Animated.Value(16)).current;
    const photoO = useRef(new Animated.Value(0)).current;
    const bodyO = useRef(new Animated.Value(0)).current;
    const bodyY = useRef(new Animated.Value(24)).current;
    const footO = useRef(new Animated.Value(0)).current;
    const footY = useRef(new Animated.Value(16)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.parallel([
                Animated.spring(photoY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 130 }),
                Animated.timing(photoO, { toValue: 1, duration: 120, useNativeDriver: true }),
            ]),
            Animated.parallel([
                Animated.spring(bodyY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 110 }),
                Animated.timing(bodyO, { toValue: 1, duration: 60, useNativeDriver: true }),
            ]),
            Animated.parallel([
                Animated.spring(footY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 110 }),
                Animated.timing(footO, { toValue: 1, duration: 40, useNativeDriver: true }),
            ]),
        ]).start();
    }, []);

    const btnScale = useRef(new Animated.Value(1)).current;
    const pressIn = () => Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, damping: 14, stiffness: 280 }).start();
    const pressOut = () => Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 220 }).start();

    const tickScale = useRef(new Animated.Value(0)).current;
    const bounceTick = () => {
        tickScale.setValue(0);
        Animated.spring(tickScale, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 200 }).start();
    };

    const isVideo = (uri: string) => /\.(mp4|mov|mkv|webm|ogg)$/i.test(uri);

    const fixedUri = mediaUrl
        ? (mediaUrl.startsWith('file://') || mediaUrl.startsWith('https://') ? mediaUrl : `file://${mediaUrl}`)
        : null;

    const getRealGeoposition = async () => {
        setLocating(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') { showToast('Location permission denied', false); return; }
            const data = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
            if (data.mocked) {
                Vibration.vibrate(FAIL_VIB);
                showToast('Fake GPS detected. Real moments only.', false);
                return;
            }
            const name = await getLocationName(data.coords.longitude, data.coords.latitude);
            setCoords({
                lat: data.coords.latitude,
                lng: data.coords.longitude,
            });
            setLocation(name ?? 'Verified location');
            bounceTick();
            Vibration.vibrate(SUCCESS_VIB);
            showToast('Location verified', true);
        } catch {
            showToast('Could not get location', false);
        } finally {
            setLocating(false);
        }
    };

    const handlePublish = () => {
        if (caption.length > 255) { Vibration.vibrate(FAIL_VIB); showToast('Caption too long (max 255)', false); return; }
        if (!location) { Vibration.vibrate(FAIL_VIB); showToast('Verify your location first', false); return; }
        if (!mediaUrl) { Vibration.vibrate(FAIL_VIB); showToast('Add a photo to continue', false); return; }
        Vibration.vibrate(SUCCESS_VIB);
        createPost(caption, [mediaUrl], location, coords, resolution, false, comments);
        router.replace('/profile');
    };

    const handleLeave = () => {
        if (caption || location) { setConfirm(true); } else { router.back(); }
    };

    const charLeft = 255 - caption.length;
    const charColor = charLeft < 30 ? (charLeft < 10 ? c.err : '#F59E0B') : c.fgLow;
    const canPublish = !!mediaUrl && !!location;

    return (
        <KeyboardAvoidingView style={[s.root, { backgroundColor: c.bg }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={c.bg} />

            <Web3Toast message={toast.msg} visible={toast.visible}
                onHide={() => setToast(t => ({ ...t, visible: false }))} isSuccess={toast.ok} />

            <ConfirmDialog visible={confirm}
                onConfirm={() => { setConfirm(false); router.back(); router.back(); }}
                onCancel={() => setConfirm(false)}
                title="Discard this post?"
                message="Your draft will be lost."
                confirmLabel="Discard"
                confirmGradient={['#F87171', '#EF4444']} />

            <View style={[s.header, { borderBottomColor: c.sep }]}>
                <TouchableOpacity onPress={handleLeave}
                    style={[s.backBtn, { backgroundColor: c.sep }]}
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                    <ArrowLeft size={20} color={c.fg} strokeWidth={1.7} />
                </TouchableOpacity>
                <Text style={[s.headerTitle, { color: c.fg }]}>new post</Text>
                <Animated.View style={{ transform: [{ scale: btnScale }] }}>
                    <TouchableOpacity
                        onPress={handlePublish}
                        onPressIn={pressIn}
                        onPressOut={pressOut}
                        activeOpacity={0.85}
                    >
                        <LinearGradient
                            colors={canPublish ? [c.accent, '#9333EA'] : [c.sep, c.sep]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[
                                s.publishBtn,
                                canPublish && {
                                    shadowColor: c.accent,
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.4,
                                    shadowRadius: 8,
                                    elevation: 5,
                                }
                            ]}
                        >
                            <Send size={14} color={canPublish ? '#fff' : c.fgLow} strokeWidth={2.5} />
                            <Text style={[s.publishTxt, { color: canPublish ? '#fff' : c.fgLow }]}>
                                post
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>
            </View>

            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>

                <Animated.View style={{ opacity: photoO, transform: [{ translateY: photoY }] }}>
                    <View style={{ height: PHOTO_H, width, overflow: 'hidden', borderRadius: 24 }}>
                        {fixedUri ? (
                            <>
                                {isVideo(mediaUrl!) ? (
                                    <VideoPlayer uri={fixedUri} />
                                ) : (
                                    <FastImage
                                        source={{ uri: fixedUri, priority: FastImage.priority.high, cache: FastImage.cacheControl.immutable }}
                                        style={StyleSheet.absoluteFillObject}
                                        resizeMode={FastImage.resizeMode.cover}
                                    />
                                )}
                                <LinearGradient
                                    colors={c.photoTopOverlay}
                                    style={[s.photoGrad, { top: 0, bottom: undefined, height: '15%' }]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 0, y: 1 }}
                                />
                                <LinearGradient
                                    colors={c.photoOverlay}
                                    style={s.photoGrad}
                                    start={{ x: 0, y: 0.5 }}
                                    end={{ x: 0, y: 1 }}
                                />
                                <TouchableOpacity onPress={() => router.navigate('/camera')} style={s.changeBtn}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                    <Camera size={13} color="rgba(255,255,255,0.88)" strokeWidth={2} />
                                    <Text style={s.changeTxt}>change</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <TouchableOpacity onPress={() => router.navigate('/camera')}
                                style={[s.photoEmpty, { backgroundColor: c.accentDim, borderColor: `${c.accent}33` }]}
                                activeOpacity={0.75}>
                                <View style={[s.emptyIcon, { backgroundColor: c.accentDim, borderColor: `${c.accent}55` }]}>
                                    <Camera size={30} color={c.accent} strokeWidth={1.5} />
                                </View>
                                <Text style={[s.emptyTitle, { color: c.fg }]}>tap to add photo</Text>
                                <Text style={[s.emptySub, { color: c.fgMid }]}>required to publish</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </Animated.View>

                <Animated.View style={{ opacity: bodyO, transform: [{ translateY: bodyY }] }}>

                    <View style={s.captionWrap}>
                        <TextInput
                            style={[s.captionInput, { color: c.fg }]}
                            multiline
                            placeholder="Write a caption…"
                            placeholderTextColor={c.inputPh}
                            value={caption}
                            onChangeText={setCaption}
                            maxLength={255}
                        />
                        {caption.length > 0 && (
                            <Text style={[s.charCount, { color: charColor }]}>{charLeft}</Text>
                        )}
                    </View>

                    <View style={[s.divider, { backgroundColor: c.sep }]} />

                    <TouchableOpacity
                        onPress={location ? undefined : getRealGeoposition}
                        disabled={locating}
                        activeOpacity={location ? 1 : 0.6}
                        style={s.row}>
                        <View style={[s.rowIcon, { backgroundColor: location ? c.okDim : 'transparent' }]}>
                            {locating ? (
                                <LocatingDots color={c.accent} />
                            ) : location ? (
                                <Animated.View style={{ transform: [{ scale: tickScale }] }}>
                                    <CheckCircle2 size={16} color={c.ok} strokeWidth={2.2} />
                                </Animated.View>
                            ) : (
                                <MapPin size={16} color={c.fgMid} strokeWidth={1.8} />
                            )}
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[s.rowLabel, { color: c.fgLow }]}>
                                proof of presence{!location && <Text style={{ color: c.err }}> *</Text>}
                            </Text>
                            <Text numberOfLines={1} style={[s.rowValue, {
                                color: location ? c.ok : locating ? c.accent : c.fgMid
                            }]}>
                                {locating ? 'securing coordinates…' : location ? location : 'tap to verify IRL location'}
                            </Text>
                        </View>
                        {!location && !locating && (
                            <View style={[s.pill, { borderColor: `${c.accent}44`, backgroundColor: c.accentDim }]}>
                                <Text style={[s.pillText, { color: c.accent }]}>verify</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {!!location && (
                        <View style={[s.resolutionRow, { paddingHorizontal: 20, paddingBottom: 16 }]}>
                            {RESOLUTION_LEVELS.map(({ res, label, sub }) => {
                                const active = resolution === res;
                                return (
                                    <TouchableOpacity
                                        key={res}
                                        onPress={() => setResolution(res)}
                                        activeOpacity={0.75}
                                        style={[
                                            s.resPill,
                                            {
                                                flex: 1,
                                                borderColor: active ? c.accent : c.sep,
                                                backgroundColor: active ? c.accentDim : 'transparent',
                                            },
                                        ]}
                                    >
                                        <Text style={[s.resPillLabel, { color: active ? c.accent : c.fgMid }]}>
                                            {label}
                                        </Text>
                                        <Text style={[s.resPillSub, { color: active ? c.accent : c.fgLow, opacity: active ? 0.75 : 0.55 }]}>
                                            {sub}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

                    <View style={[s.divider, { backgroundColor: c.sep }]} />

                    <View style={s.row}>
                        <View style={[s.rowIcon, { backgroundColor: 'transparent' }]}>
                            <MessageCircle size={16} color={c.fgMid} strokeWidth={1.8} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[s.rowLabel, { color: c.fgLow }]}>comments</Text>
                            <Text style={[s.rowValue, { color: c.fgMid }]}>
                                {comments ? 'open to everyone' : 'disabled'}
                            </Text>
                        </View>
                        <Switch
                            value={comments}
                            onValueChange={setComments}
                            trackColor={{ false: scheme === 'dark' ? '#1F1133' : '#D1C7E8', true: c.accent }}
                            thumbColor="#fff"
                            ios_backgroundColor={scheme === 'dark' ? '#1F1133' : '#D1C7E8'}
                        />
                    </View>

                    <View style={[s.divider, { backgroundColor: c.sep }]} />
                </Animated.View>

                <View style={{ height: Platform.OS === 'ios' ? 48 : 32 }} />

            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1 },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 14 : 18,
        paddingBottom: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: {
        fontSize: 16,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        letterSpacing: 0.8,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },

    photoGrad: {
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        height: '52%',
    },
    changeBtn: {
        position: 'absolute',
        bottom: 14,
        right: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.52)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    changeTxt: {
        fontSize: 12,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        color: 'rgba(255,255,255,0.9)',
        letterSpacing: 0.4,
    },
    photoEmpty: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderBottomWidth: 1,
    },
    emptyIcon: {
        width: 72,
        height: 72,
        borderRadius: 20,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        marginBottom: 6,
    },
    emptySub: {
        fontSize: 13,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
    },

    captionWrap: {
        paddingHorizontal: 20,
        paddingTop: 22,
        paddingBottom: 20,
        position: 'relative',
    },
    captionInput: {
        fontSize: 17,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
        lineHeight: 26,
        minHeight: 52,
        textAlignVertical: 'top',
    },
    charCount: {
        position: 'absolute',
        right: 20,
        bottom: 18,
        fontSize: 11,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },

    divider: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 20,
    },

    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        gap: 14,
    },
    rowIcon: {
        width: 32,
        height: 32,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
    },
    rowLabel: {
        fontSize: 10,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        marginBottom: 3,
    },
    rowValue: {
        fontSize: 14,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    pill: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
    },
    pillText: {
        fontSize: 12,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        letterSpacing: 0.5,
    },

    publishBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 20,
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    publishTxt: {
        fontSize: 14,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        letterSpacing: 0.5,
    },

    resolutionRow: {
        flexDirection: 'row',
        gap: 8,
    },
    resPill: {
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
    },
    resPillLabel: {
        fontSize: 12,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        letterSpacing: 0.5,
    },
    resPillSub: {
        fontSize: 10,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
        marginTop: 2,
    },
});