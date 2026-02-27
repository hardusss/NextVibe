import React, { useState, useRef, useCallback } from "react";
import {
    View, Text, TouchableOpacity, StyleSheet,
    StatusBar, Animated, Dimensions, Platform, PanResponder
} from "react-native";
import { Camera, useCameraDevice, useCameraFormat } from "react-native-vision-camera";
import { useRouter, useFocusEffect } from "expo-router";
import Web3Toast from "../Shared/Toasts/Web3Toast";
import { X, SwitchCamera, Zap, ZapOff, Timer, Grid3x3 } from "lucide-react-native";

const { width: SW, height: SH } = Dimensions.get("window");

const WHITE = "rgba(255,255,255,0.95)";
const WHITE_DIM = "rgba(255,255,255,0.5)";
const WHITE_FAINT = "rgba(255,255,255,0.12)";
const ACCENT = "rgba(196,167,255,0.95)";
const ACCENT_BG = "rgba(167,139,250,0.2)";
const ACCENT_BORDER = "rgba(196,167,255,0.4)";
const FOCUS_COLOR = "rgba(255,213,0,0.95)";
const BG_SOLID = "#0A0410";

type FlashMode = 'off' | 'on' | 'auto';
type TimerMode = 0 | 3 | 10;
type AspectMode = 'full' | '4:3' | '1:1';

// ─── Focus Square ─────────────────────────────────────────────────────────────

function FocusSquare({ x, y, scale, opacity }: {
    x: number; y: number;
    scale: Animated.Value; opacity: Animated.Value;
}) {
    const S = 68, C = 14;
    return (
        <Animated.View pointerEvents="none" style={{
            position: 'absolute', left: x - S / 2, top: y - S / 2,
            width: S, height: S, opacity, transform: [{ scale }],
        }}>
            {([
                { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
                { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
                { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
                { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
            ] as const).map((s, i) => (
                <View key={i} style={[{ position: 'absolute', width: C, height: C, borderColor: FOCUS_COLOR }, s]} />
            ))}
            <View style={{ position: 'absolute', top: S / 2 - 2, left: S / 2 - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: FOCUS_COLOR }} />
        </Animated.View>
    );
}

// ─── Exposure Bar ─────────────────────────────────────────────────────────────
// Range -3..+3 for stronger effect, delta-based pan

const EXP_MIN = -6;
const EXP_MAX = 6;
const EXP_RANGE = EXP_MAX - EXP_MIN;
const EXP_H = 220;
const THUMB_R = 10; // thumb radius (circle)

function ExposureBar({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const startVal = useRef(value);
    const startY = useRef(0);

    const clamp = (v: number) =>
        Math.round(Math.min(EXP_MAX, Math.max(EXP_MIN, v)) * 10) / 10;

    // y=0 → EXP_MAX (bright), y=EXP_H → EXP_MIN (dark)
    const valToY = (v: number) => ((EXP_MAX - v) / EXP_RANGE) * EXP_H;

    const panRef = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (e) => {
                startVal.current = value;
                startY.current = e.nativeEvent.pageY;
            },
            onPanResponderMove: (e) => {
                const dy = e.nativeEvent.pageY - startY.current;
                const delta = -(dy / EXP_H) * EXP_RANGE;
                onChange(clamp(startVal.current + delta));
            },
        })
    ).current;

    const thumbY = valToY(value) - THUMB_R;
    const fillH = EXP_H - valToY(value);

    return (
        <View style={expStyles.wrap}>
            <Text style={expStyles.icon}>☀</Text>
            {/* Wide hit area around the thin track */}
            <View style={expStyles.hitArea} {...panRef.panHandlers}>
                <View style={expStyles.track}>
                    <View style={[expStyles.fill, { height: Math.max(0, fillH) }]} />
                    <View style={[expStyles.thumb, { top: thumbY }]} />
                    <View style={expStyles.centerTick} />
                </View>
            </View>
        </View>
    );
}

const expStyles = StyleSheet.create({
    wrap: { alignItems: 'center', gap: 8 },
    icon: { color: FOCUS_COLOR, fontSize: 15 },
    // Wide transparent hit area so finger doesn't need to be exact
    hitArea: {
        width: 44,
        height: EXP_H,
        justifyContent: 'center',
        alignItems: 'center',
    },
    track: {
        width: 3,
        height: EXP_H,
        backgroundColor: 'rgba(255,213,0,0.2)',
        borderRadius: 2,
        position: 'relative',
        overflow: 'visible',
    },
    fill: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        backgroundColor: FOCUS_COLOR,
        borderRadius: 2,
    },
    thumb: {
        position: 'absolute',
        left: -(THUMB_R * 2 - 3) / 2,
        width: THUMB_R * 2,
        height: THUMB_R * 2,
        borderRadius: THUMB_R,
        backgroundColor: FOCUS_COLOR,
        shadowColor: FOCUS_COLOR,
        shadowOpacity: 0.8,
        shadowRadius: 8,
        elevation: 6,
    },
    centerTick: {
        position: 'absolute',
        top: EXP_H / 2 - 1,
        left: -5, right: -5,
        height: 1,
        backgroundColor: 'rgba(255,213,0,0.35)',
    },
});

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CameraScreen() {
    const router = useRouter();
    const cameraRef = useRef<Camera>(null);
    const shutterAnim = useRef(new Animated.Value(1)).current;
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [cameraSide, setCameraSide] = useState<"front" | "back">("back");
    const [camPerm, setCamPerm] = useState(false);
    const [flash, setFlash] = useState<FlashMode>('off');
    const [timer, setTimer] = useState<TimerMode>(0);
    const [aspect, setAspect] = useState<AspectMode>('full');
    const [grid, setGrid] = useState(false);
    const [exposure, setExposure] = useState(0);
    const [showExposure, setShowExposure] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [mediaURLS, setMediaURLS] = useState<string[]>([]);
    const [toast, setToast] = useState({ text: "", show: false });
    const [focusPt, setFocusPt] = useState<{ x: number; y: number } | null>(null);

    const focusScale = useRef(new Animated.Value(1.4)).current;
    const focusOpacity = useRef(new Animated.Value(0)).current;

    const showToast = (t: string) => setToast({ text: t, show: true });

    const device = useCameraDevice(cameraSide);
    const format = useCameraFormat(device, [
        { photoResolution: 'max' },
        { photoResolution: { width: 4032, height: 3024 } },
        { photoResolution: { width: 3024, height: 4032 } },
        { photoHdr: true },
    ]);

    useFocusEffect(useCallback(() => {
        (async () => {
            const c = await Camera.requestCameraPermission();
            setCamPerm(c === "granted");
        })();
    }, []));

    useFocusEffect(useCallback(() => {
        if (!mediaURLS.length) return;
        router.replace({ pathname: "/create-post", params: { urls: JSON.stringify(mediaURLS) } });
        setMediaURLS([]);
    }, [mediaURLS]));

    if (!device) return null;

    // Viewfinder dimensions
    const vfHeight = aspect === 'full' ? SH : aspect === '4:3' ? SW * (4 / 3) : SW;
    const vfRadius = aspect === '1:1' ? 20 : 0;

    // Exposure bar position — right of focus square, vertically centered
    const EXP_OFFSET_X = 54;
    const expLeft = focusPt ? Math.min(focusPt.x + EXP_OFFSET_X, SW - 50) : 0;
    const expTop = focusPt ? Math.max(16, Math.min(focusPt.y - EXP_H / 2, vfHeight - EXP_H - 16)) : 0;

    // ─── Tap to focus ─────────────────────────────────────────────────────────

    const handleTap = async (e: any) => {
        const { locationX, locationY } = e.nativeEvent;

        setFocusPt({ x: locationX, y: locationY });
        setShowExposure(true);

        focusScale.setValue(1.5);
        focusOpacity.setValue(1);
        Animated.parallel([
            Animated.spring(focusScale, { toValue: 1, useNativeDriver: true, friction: 5 }),
            Animated.sequence([
                Animated.delay(1400),
                Animated.timing(focusOpacity, { toValue: 0.45, duration: 400, useNativeDriver: true }),
            ]),
        ]).start();

        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setShowExposure(false), 5000);

        try {
            await cameraRef.current?.focus({ x: locationX, y: locationY });
        } catch (_) { }
    };

    const handleExposureChange = (v: number) => {
        setExposure(v);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setShowExposure(false), 3000);
    };

    // ─── Capture ──────────────────────────────────────────────────────────────

    const doCapture = async () => {
        Animated.sequence([
            Animated.timing(shutterAnim, { toValue: 0.88, duration: 70, useNativeDriver: true }),
            Animated.spring(shutterAnim, { toValue: 1, useNativeDriver: true }),
        ]).start();

        try {
            const photo = await cameraRef.current?.takePhoto({
                flash: flash as 'off' | 'on' | 'auto',
                enableShutterSound: false,
            });
            if (photo?.path) {
                setMediaURLS([photo.path]);
            } else {
                showToast("Could not save photo");
            }
        } catch (err: any) {
            showToast(err?.message ?? "Failed to take photo");
        }
    };

    const handleShutter = () => {
        if (countdown !== null) return;
        if (timer === 0) { doCapture(); return; }
        let c = timer;
        setCountdown(c);
        timerRef.current = setInterval(() => {
            c -= 1;
            if (c <= 0) { clearInterval(timerRef.current!); setCountdown(null); doCapture(); }
            else setCountdown(c);
        }, 1000);
    };

    // ─── Permission screen ────────────────────────────────────────────────────

    if (!camPerm) {
        return (
            <View style={styles.permWrap}>
                <StatusBar barStyle="light-content" backgroundColor={BG_SOLID} />
                <Text style={styles.permTitle}>Camera access needed</Text>
                <TouchableOpacity style={styles.permBtn} onPress={async () => {
                    const c = await Camera.requestCameraPermission();
                    setCamPerm(c === "granted");
                }}>
                    <Text style={styles.permBtnText}>Allow Access</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="#0A0410" translucent />
            <Web3Toast message={toast.text} visible={toast.show} onHide={() => setToast(t => ({ ...t, show: false }))} isSuccess={false} />

            {/* ── Top toolbar ── */}
            <View style={styles.topBar}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <X size={22} color={WHITE} strokeWidth={1.8} />
                </TouchableOpacity>
                <View style={styles.topIcons}>
                    <TouchableOpacity
                        onPress={() => setFlash(f => f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off')}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={[styles.iconBtn, flash !== 'off' && styles.iconBtnActive]}
                    >
                        {flash === 'on' ? <Zap size={17} color="#FFD600" strokeWidth={1.8} /> :
                            flash === 'auto' ? <><Zap size={17} color={ACCENT} strokeWidth={1.8} /><Text style={styles.iconBtnLabel}>A</Text></> :
                                <ZapOff size={17} color={WHITE_DIM} strokeWidth={1.8} />}
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setTimer(t => t === 0 ? 3 : t === 3 ? 10 : 0)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={[styles.iconBtn, timer > 0 && styles.iconBtnActive]}
                    >
                        <Timer size={17} color={timer > 0 ? ACCENT : WHITE_DIM} strokeWidth={1.8} />
                        {timer > 0 && <Text style={styles.iconBtnLabel}>{timer}s</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setGrid(v => !v)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={[styles.iconBtn, grid && styles.iconBtnActive]}
                    >
                        <Grid3x3 size={17} color={grid ? ACCENT : WHITE_DIM} strokeWidth={1.8} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setAspect(a => a === 'full' ? '4:3' : a === '4:3' ? '1:1' : 'full')}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.iconBtn}
                    >
                        <Text style={styles.aspectText}>{aspect === 'full' ? '9:16' : aspect}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Viewfinder ── */}
            <View style={styles.vfContainer}>
                <View style={[styles.vfBox, { width: SW, height: vfHeight, borderRadius: vfRadius, overflow: 'hidden' }]}>
                    <Camera
                        ref={cameraRef}
                        style={StyleSheet.absoluteFill}
                        device={device}
                        format={format}
                        isActive={true}
                        photo={true}
                        video={false}
                        audio={false}
                        exposure={exposure}
                        lowLightBoost={device.supportsLowLightBoost}
                        enableZoomGesture
                    />

                    {/* Single-finger tap → focus; pinch passes through to Camera */}
                    <View
                        style={StyleSheet.absoluteFill}
                        onStartShouldSetResponder={(e) => e.nativeEvent.touches.length === 1}
                        onResponderRelease={(e) => {
                            if (e.nativeEvent.changedTouches.length === 1) handleTap(e);
                        }}
                    />

                    {/* Grid */}
                    {grid && (
                        <View style={StyleSheet.absoluteFill} pointerEvents="none">
                            {[1, 2].map(i => <View key={`h${i}`} style={[styles.gridLine, styles.gridH, { top: `${i * 33.33}%` as any }]} />)}
                            {[1, 2].map(i => <View key={`v${i}`} style={[styles.gridLine, styles.gridV, { left: `${i * 33.33}%` as any }]} />)}
                        </View>
                    )}

                    {/* Focus square */}
                    {focusPt && <FocusSquare x={focusPt.x} y={focusPt.y} scale={focusScale} opacity={focusOpacity} />}

                    {/* Exposure bar */}
                    {showExposure && focusPt && (
                        <View style={{ position: 'absolute', left: expLeft, top: expTop }} pointerEvents="box-none">
                            <ExposureBar value={exposure} onChange={handleExposureChange} />
                        </View>
                    )}

                    {/* Countdown */}
                    {countdown !== null && (
                        <TouchableOpacity style={styles.countdownOverlay} activeOpacity={1}
                            onPress={() => { clearInterval(timerRef.current!); setCountdown(null); }}>
                            <Text style={styles.countdownNum}>{countdown}</Text>
                            <Text style={styles.countdownSub}>tap to cancel</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* ── Bottom controls ── */}
            <View style={styles.bottomBar}>
                {/* Placeholder for symmetry */}
                <View style={{ width: 50 }} />

                <Animated.View style={{ transform: [{ scale: shutterAnim }] }}>
                    <TouchableOpacity onPress={handleShutter} activeOpacity={0.85} style={styles.shutterOuter}>
                        <View style={styles.shutterInner} />
                    </TouchableOpacity>
                </Animated.View>

                <TouchableOpacity
                    onPress={() => setCameraSide(s => s === "back" ? "front" : "back")}
                    style={styles.flipBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <SwitchCamera size={24} color={WHITE} strokeWidth={1.5} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const TOP_H = Platform.OS === 'ios' ? 104 : 88;
const BOTTOM_H = Platform.OS === 'ios' ? 110 : 96;

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG_SOLID },

    topBar: {
        height: TOP_H,
        paddingTop: Platform.OS === 'ios' ? 54 : 40,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(0,0,0,0.4)',
        zIndex: 10,
    },
    topIcons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        paddingHorizontal: 10, paddingVertical: 7,
        borderRadius: 20, backgroundColor: WHITE_FAINT,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    iconBtnActive: { backgroundColor: ACCENT_BG, borderColor: ACCENT_BORDER },
    iconBtnLabel: { fontFamily: 'Dank Mono', fontSize: 10, color: ACCENT },
    aspectText: { fontFamily: 'Dank Mono', fontSize: 11, color: WHITE_DIM },

    vfContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG_SOLID },
    vfBox: { backgroundColor: '#000' },

    gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.15)' },
    gridH: { left: 0, right: 0, height: StyleSheet.hairlineWidth },
    gridV: { top: 0, bottom: 0, width: StyleSheet.hairlineWidth },

    countdownOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center', alignItems: 'center',
    },
    countdownNum: { color: WHITE, fontSize: 100, fontFamily: 'Dank Mono Bold', includeFontPadding: false },
    countdownSub: { color: WHITE_DIM, fontFamily: 'Dank Mono', fontSize: 14, marginTop: 8 },

    bottomBar: {
        height: BOTTOM_H,
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        paddingBottom: Platform.OS === 'ios' ? 28 : 12,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    flipBtn: {
        width: 50, height: 50, borderRadius: 25,
        backgroundColor: WHITE_FAINT,
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    },
    shutterOuter: {
        width: 80, height: 80, borderRadius: 40,
        borderWidth: 3, borderColor: 'rgba(255,255,255,0.6)',
        justifyContent: 'center', alignItems: 'center',
    },
    shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: WHITE },

    permWrap: { flex: 1, backgroundColor: BG_SOLID, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 },
    permTitle: { fontFamily: 'Dank Mono Bold', fontSize: 20, color: WHITE, includeFontPadding: false },
    permBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 20, backgroundColor: ACCENT_BG, borderWidth: 1, borderColor: ACCENT_BORDER },
    permBtnText: { fontFamily: 'Dank Mono Bold', fontSize: 15, color: ACCENT, includeFontPadding: false },
});