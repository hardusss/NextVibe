import React from "react";
import { View, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { ArrowLeft, Eye, EyeOff, ScrollText } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "@/components/Shared/GlassSurface";

interface HeaderProps {
    isDarkMode: boolean;
    isBalanceHidden: boolean;
    onToggleBalance: () => void;
    onNavigateBack: () => void;
    onNavigateToTransactions: () => void;
}

const Header: React.FC<HeaderProps> = ({
    isDarkMode,
    isBalanceHidden,
    onToggleBalance,
    onNavigateBack,
    onNavigateToTransactions,
}) => {
    const insets = useSafeAreaInsets();
    const iconColor = isDarkMode ? "rgba(196,167,255,0.9)" : "rgba(109,40,217,0.85)";
    const bg = isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
    const border = isDarkMode ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";

    return (
        <View style={[
            styles.container,
            { paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 12 }
        ]}>
            {/* Back Button — wider pill */}
            <TouchableOpacity
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                style={[
                    styles.button,
                    styles.backButton,
                    Platform.OS === 'ios' && { borderWidth: 0 },
                    Platform.OS !== 'ios' && { backgroundColor: bg, borderColor: border }
                ]}
                onPress={onNavigateBack}
                activeOpacity={0.6}
            >
                {Platform.OS === 'ios' ? (
                    <GlassSurface
                        style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', borderRadius: 20 }]}
                        glassEffectStyle="regular"
                        colorScheme={isDarkMode ? "dark" : "light"}
                        isInteractive
                        tintColor={isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)"}
                    >
                        <ArrowLeft size={20} color={iconColor} strokeWidth={1.5} />
                    </GlassSurface>
                ) : (
                    <ArrowLeft size={20} color={iconColor} strokeWidth={1.5} />
                )}
            </TouchableOpacity>

            {/* Right group */}
            <View style={styles.rightGroup}>
                <TouchableOpacity
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    style={[
                        styles.button,
                        Platform.OS === 'ios' && { borderWidth: 0 },
                        Platform.OS !== 'ios' && { backgroundColor: bg, borderColor: border }
                    ]}
                    onPress={onToggleBalance}
                    activeOpacity={0.6}
                >
                    {Platform.OS === 'ios' ? (
                        <GlassSurface
                            style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', borderRadius: 20 }]}
                            glassEffectStyle="regular"
                            colorScheme={isDarkMode ? "dark" : "light"}
                            isInteractive
                            tintColor={isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)"}
                        >
                            {isBalanceHidden
                                ? <EyeOff size={20} color={iconColor} strokeWidth={1.5} />
                                : <Eye size={20} color={iconColor} strokeWidth={1.5} />
                            }
                        </GlassSurface>
                    ) : (
                        isBalanceHidden
                            ? <EyeOff size={20} color={iconColor} strokeWidth={1.5} />
                            : <Eye size={20} color={iconColor} strokeWidth={1.5} />
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    style={[
                        styles.button,
                        styles.rightGap,
                        Platform.OS === 'ios' && { borderWidth: 0 },
                        Platform.OS !== 'ios' && { backgroundColor: bg, borderColor: border }
                    ]}
                    onPress={onNavigateToTransactions}
                    activeOpacity={0.6}
                >
                    {Platform.OS === 'ios' ? (
                        <GlassSurface
                            style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', borderRadius: 20 }]}
                            glassEffectStyle="regular"
                            colorScheme={isDarkMode ? "dark" : "light"}
                            isInteractive
                            tintColor={isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)"}
                        >
                            <ScrollText size={20} color={iconColor} strokeWidth={1.5} />
                        </GlassSurface>
                    ) : (
                        <ScrollText size={20} color={iconColor} strokeWidth={1.5} />
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        marginBottom: 30,
    },
    rightGroup: {
        flexDirection: "row",
        alignItems: "center",
    },
    button: {
        height: 54,
        width: 54,
        borderRadius: 20,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
    },
    backButton: {
        width: 84,
    },
    rightGap: {
        marginLeft: 12,
    },
});

export default Header;