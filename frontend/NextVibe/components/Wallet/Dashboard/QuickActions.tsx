import React, { useEffect, useRef } from "react";
import * as Haptics from "expo-haptics";
import { View, Text, Pressable, StyleSheet, Animated as RNAnimated, Platform } from "react-native";
import { ArrowDown, ArrowUp, ArrowLeftRight, Nfc } from "lucide-react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { MOTION } from "@/constants/motion";
import { GlassSurface } from "@/components/Shared/GlassSurface";

interface QuickActionsProps {
    isDarkMode: boolean;
    onReceive: () => void;
    onSend: () => void;
    onSwap: () => void;
    onNfcDeposit: () => void;
}

function PulseDot({ isDarkMode }: { isDarkMode: boolean }) {
    const opacity = useRef(new RNAnimated.Value(1)).current;

    useEffect(() => {
        RNAnimated.loop(
            RNAnimated.sequence([
                RNAnimated.timing(opacity, { toValue: 0.2, duration: 900, useNativeDriver: true }),
                RNAnimated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    const color = isDarkMode ? "rgba(167,139,250,0.9)" : "rgba(109,40,217,0.7)";

    return (
        <RNAnimated.View style={[styles.pulseDot, { backgroundColor: color, opacity }]} />
    );
}

const ALL_ACTIONS = [
    { id: "receive", Icon: ArrowDown, label: "Receive", pulse: false },
    { id: "send", Icon: ArrowUp, label: "Send", pulse: false },
    { id: "swap", Icon: ArrowLeftRight, label: "Swap", pulse: false },
    { id: "nfc", Icon: Nfc, label: "NFC Deposit", pulse: true },
];

// NFC HCE sharing is not supported on iOS — hide the NFC Deposit action
const ACTIONS = Platform.OS === 'ios'
    ? ALL_ACTIONS.filter(a => a.id !== 'nfc')
    : ALL_ACTIONS;

interface QuickActionButtonProps {
    action: typeof ALL_ACTIONS[number];
    bg: string;
    border: string;
    iconColor: string;
    isDarkMode: boolean;
    onPress: () => void;
}

const QuickActionButton: React.FC<QuickActionButtonProps> = ({
    action,
    bg,
    border,
    iconColor,
    isDarkMode,
    onPress,
}) => {
    const scale = useSharedValue(1);
    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return (
        <Pressable
            onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPress();
            }}
            onPressIn={() => {
                scale.value = withSpring(MOTION.press.scale, MOTION.spring.snappy);
            }}
            onPressOut={() => {
                scale.value = withSpring(1, MOTION.spring.snappy);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
            <Animated.View style={[
                styles.button,
                animStyle,
                Platform.OS === 'ios' && { borderWidth: 0 },
                Platform.OS !== 'ios' && { backgroundColor: bg, borderColor: border }
            ]}>
                {Platform.OS === 'ios' ? (
                    <GlassSurface
                        style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', borderRadius: RADIUS }]}
                        glassEffectStyle="clear"
                        colorScheme={isDarkMode ? "dark" : "light"}
                        isInteractive
                        tintColor={isDarkMode ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.005)"}
                    >
                        <action.Icon size={22} color={iconColor} strokeWidth={1.5} />
                        {action.pulse && <PulseDot isDarkMode={isDarkMode} />}
                    </GlassSurface>
                ) : (
                    <>
                        <action.Icon size={22} color={iconColor} strokeWidth={1.5} />
                        {action.pulse && <PulseDot isDarkMode={isDarkMode} />}
                    </>
                )}
            </Animated.View>
        </Pressable>
    );
};

const QuickActions: React.FC<QuickActionsProps> = ({
    isDarkMode,
    onReceive,
    onSend,
    onSwap,
    onNfcDeposit,
}) => {
    const allHandlers: Record<string, () => void> = {
        receive: onReceive,
        send: onSend,
        swap: onSwap,
        nfc: onNfcDeposit,
    };

    const bg = isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
    const border = isDarkMode ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";
    const iconColor = isDarkMode ? "rgba(196,167,255,0.9)" : "rgba(109,40,217,0.85)";
    const labelColor = isDarkMode ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";

    return (
        <View style={styles.container}>
            {ACTIONS.map((action, i) => (
                <View key={action.id} style={styles.wrapper}>
                    <QuickActionButton
                        action={action}
                        bg={bg}
                        border={border}
                        iconColor={iconColor}
                        isDarkMode={isDarkMode}
                        onPress={allHandlers[action.id]}
                    />

                    <View style={styles.labelWrap}>
                        <Text
                            style={[styles.label, { color: labelColor }]}
                            numberOfLines={1}
                            textBreakStrategy="simple"
                        >
                            {action.label}
                        </Text>
                    </View>
                </View>
            ))}
        </View>
    );
};

const BTN = 72;
const RADIUS = 20;

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        justifyContent: "space-around",
        paddingHorizontal: 8,
        marginBottom: 20,
        alignItems: "flex-start",
    },
    wrapper: {
        alignItems: "center",
        width: BTN,
    },
    button: {
        width: BTN,
        height: 68,
        borderRadius: RADIUS,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        marginBottom: 10,
    },
    pulseDot: {
        position: "absolute",
        top: 10,
        right: 11,
        width: 5,
        height: 5,
        borderRadius: 3,
    },
    labelWrap: {
        height: 17,
        justifyContent: "flex-start",
        alignItems: "center",
    },
    label: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        textAlign: "center",
        lineHeight: 17,
    },
});

export default React.memo(QuickActions);