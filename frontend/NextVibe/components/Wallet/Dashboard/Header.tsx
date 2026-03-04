import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { ArrowLeft, Eye, EyeOff, ScrollText } from "lucide-react-native";

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
    const iconColor = isDarkMode ? "rgba(196,167,255,0.9)" : "rgba(109,40,217,0.85)";
    const bg = isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
    const border = isDarkMode ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";

    return (
        <View style={styles.container}>
            {/* Back Button — wider pill */}
            <TouchableOpacity
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                style={[styles.button, styles.backButton, { backgroundColor: bg, borderColor: border }]}
                onPress={onNavigateBack}
                activeOpacity={0.6}
            >
                <ArrowLeft size={20} color={iconColor} strokeWidth={1.5} />
            </TouchableOpacity>

            {/* Right group */}
            <View style={styles.rightGroup}>
                <TouchableOpacity
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    style={[styles.button, { backgroundColor: bg, borderColor: border }]}
                    onPress={onToggleBalance}
                    activeOpacity={0.6}
                >
                    {isBalanceHidden
                        ? <EyeOff size={20} color={iconColor} strokeWidth={1.5} />
                        : <Eye size={20} color={iconColor} strokeWidth={1.5} />
                    }
                </TouchableOpacity>

                <TouchableOpacity
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    style={[styles.button, styles.rightGap, { backgroundColor: bg, borderColor: border }]}
                    onPress={onNavigateToTransactions}
                    activeOpacity={0.6}
                >
                    <ScrollText size={20} color={iconColor} strokeWidth={1.5} />
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
        paddingTop: 20,
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