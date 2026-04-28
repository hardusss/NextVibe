import { Pressable, View, Text, StyleSheet, useColorScheme } from "react-native";
import LottieView from "lottie-react-native";
import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from "react";
import {
    BottomSheetModal,
    BottomSheetView,
    BottomSheetBackdropProps,
    useBottomSheet,
} from '@gorhom/bottom-sheet';
import Animated, {
    interpolate, Extrapolation, useAnimatedStyle
} from 'react-native-reanimated';
import { BlurView } from '@react-native-community/blur';

interface PropsVerifyBadge {
    isLooped: boolean;
    isVisible: boolean;
    haveModal: boolean;
    isStatic: boolean;
    size: number;
};

export interface VerifyBadgeSheetRef {
    present: () => void;
    dismiss: () => void;
}

/**
 * Custom backdrop – same pattern used across the app (InviteBottomSheet, etc.)
 */
const VerifyBackdrop = ({ animatedIndex, style }: BottomSheetBackdropProps) => {
    const isDark = useColorScheme() === 'dark';
    const { close } = useBottomSheet();

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(animatedIndex.value, [-1, 0], [0, 1], Extrapolation.CLAMP),
    }));

    return (
        <Animated.View style={[StyleSheet.absoluteFill, style, animatedStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => close()}>
                <BlurView style={StyleSheet.absoluteFill} blurType={isDark ? "dark" : "light"} blurAmount={2} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.2)' }]} />
            </Pressable>
        </Animated.View>
    );
};

export default function VerifyBadge ({ isLooped, isVisible, haveModal, isStatic, size }: PropsVerifyBadge) {
    const [sheetVisible, setSheetVisible] = useState(false);
    const lottieRef = useRef<LottieView>(null);
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const isDark = useColorScheme() === 'dark';

    useEffect(() => {
        const lottie = lottieRef.current;
        if (!lottie) return;

        // static = ever freeze
        if (isStatic) {
            lottie.play(110, 110);
            return;
        }

        // if not visible = stop
        if (!isVisible) {
            lottie.play(110, 110);
            return;
        }

        // visible
        if (isLooped) {
            lottie.play(30, 110); // countined or start
        }
    }, [isVisible, isStatic, isLooped]);


    const onPressVerified = () => {
        bottomSheetModalRef.current?.present();
    };

    const handleSheetChanges = useCallback((index: number) => {
        if (index === -1) {
            setSheetVisible(false);
        }
    }, []);

    // Theme colors matching the app's design system
    const bg = isDark ? '#0f021c' : '#ffffff';
    const mainColor = isDark ? '#ffffff' : '#1f2937';
    const mutedColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.32)';
    const handleColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
    const accentText = isDark ? '#d8b4fe' : '#7c3aed';
    const borderColor = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';
    
    return (
        <>
        <Pressable 
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => {
                if (!haveModal) return;
                onPressVerified();
            }}
        >
            <LottieView
                ref={lottieRef}
                cacheComposition
                speed={0.5}
                source={require('@/assets/lottie/verified.json')}
                autoPlay={!isStatic && isVisible}   // only when visible
                loop={false}
                progress={isStatic ? 1 : undefined}
                style={{ width: size, height: size }}
                onAnimationFinish={
                    !isStatic && isLooped
                    ? () => {
                        if (isVisible) {
                            lottieRef.current?.play(30, 110);
                        }
                        }
                    : undefined
                }
                />
        </Pressable>

        {haveModal && (
            <BottomSheetModal
                ref={bottomSheetModalRef}
                snapPoints={['38%']}
                index={0}
                onChange={handleSheetChanges}
                backdropComponent={VerifyBackdrop}
                backgroundStyle={{ backgroundColor: bg }}
                handleIndicatorStyle={{ backgroundColor: handleColor, width: 36 }}
                enablePanDownToClose={true}
            >
                <BottomSheetView style={[styles.container, { backgroundColor: bg }]}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={[styles.iconCircle, { borderColor: accentText, backgroundColor: isDark ? 'rgba(163, 100, 245, 0.15)' : 'rgba(163, 100, 245, 0.1)' }]}>
                            <LottieView
                                speed={0.7}
                                progress={1}
                                source={require('@/assets/lottie/verified.json')}
                                autoPlay
                                loop={false}
                                style={{ width: 56, height: 56 }}
                            />
                        </View>
                    </View>

                    {/* Title */}
                    <Text style={[styles.mainTitle, { color: mainColor }]}>Verified Account</Text>

                    {/* Divider */}
                    <View style={[styles.divider, { backgroundColor: accentText }]} />

                    {/* Description */}
                    <Text style={[styles.description, { color: mutedColor }]}>
                        This account has been verified by the{"\n"}
                        <Text style={[styles.brandHighlight, { color: accentText }]}>NextVibe</Text> team
                    </Text>

                    {/* Official Badge */}
                    <View style={styles.badgeContainer}>
                        <View style={[styles.badge, { 
                            backgroundColor: isDark ? 'rgba(163, 100, 245, 0.14)' : 'rgba(163, 100, 245, 0.08)',
                            borderColor: isDark ? 'rgba(163, 100, 245, 0.4)' : 'rgba(163, 100, 245, 0.3)',
                        }]}>
                            <Text style={[styles.badgeText, { color: accentText }]}>✓</Text>
                            <Text style={[styles.badgeLabel, { color: accentText }]}>OFFICIAL</Text>
                        </View>
                    </View>
                </BottomSheetView>
            </BottomSheetModal>
        )}
        </>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 32,
        alignItems: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 20,
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    mainTitle: {
        fontSize: 24,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
        marginBottom: 14,
        letterSpacing: 0.5,
        textAlign: 'center',
    },
    divider: {
        width: 60,
        height: 3,
        borderRadius: 2,
        marginBottom: 16,
    },
    description: {
        fontSize: 15,
        fontFamily: "Dank Mono",
        includeFontPadding: false,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 20,
    },
    brandHighlight: {
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
        fontSize: 16,
    },
    badgeContainer: {
        marginTop: 4,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        gap: 8,
    },
    badgeText: {
        fontSize: 16,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
    },
    badgeLabel: {
        fontSize: 12,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
        letterSpacing: 1.5,
    },
});