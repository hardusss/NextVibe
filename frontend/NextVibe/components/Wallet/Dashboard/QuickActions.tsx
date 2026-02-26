import React, { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { ArrowDown, ArrowUp, ArrowLeftRight, Nfc } from "lucide-react-native";

interface QuickActionsProps {
    isDarkMode: boolean;
    onReceive: () => void;
    onSend: () => void;
    onSwap: () => void;
    onNfcDeposit: () => void;
}

function PulseDot({ isDarkMode }: { isDarkMode: boolean }) {
    const opacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 0.2, duration: 900, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    const color = isDarkMode ? "rgba(167,139,250,0.9)" : "rgba(109,40,217,0.7)";

    return (
        <Animated.View style={[styles.pulseDot, { backgroundColor: color, opacity }]} />
    );
}

const ACTIONS = [
    { id: "receive", Icon: ArrowDown, label: "Receive", pulse: false },
    { id: "send", Icon: ArrowUp, label: "Send", pulse: false },
    { id: "swap", Icon: ArrowLeftRight, label: "Swap", pulse: false },
    { id: "nfc", Icon: Nfc, label: "NFC Deposit", pulse: true },
];

const QuickActions: React.FC<QuickActionsProps> = ({
    isDarkMode,
    onReceive,
    onSend,
    onSwap,
    onNfcDeposit,
}) => {
    const handlers = [onReceive, onSend, onSwap, onNfcDeposit];

    const bg = isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
    const border = isDarkMode ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";
    const iconColor = isDarkMode ? "rgba(196,167,255,0.9)" : "rgba(109,40,217,0.85)";
    const labelColor = isDarkMode ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";

    return (
        <View style={styles.container}>
            {ACTIONS.map((action, i) => (
                <View key={action.id} style={styles.wrapper}>
                    <TouchableOpacity
                        onPress={handlers[i]}
                        activeOpacity={0.6}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <View style={[styles.button, { backgroundColor: bg, borderColor: border }]}>
                            <action.Icon size={22} color={iconColor} strokeWidth={1.5} />
                            {action.pulse && <PulseDot isDarkMode={isDarkMode} />}
                        </View>
                    </TouchableOpacity>

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
        marginBottom: 30,
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

export default QuickActions;