import { View, TouchableOpacity, Text, Animated, Share } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EdgeInsets } from "react-native-safe-area-context";
import { useEffect, useRef } from "react";
import createDepositStyles from "@/styles/deposit.styles";

/**
 * Props for the ShareButton component
 */
interface ShareButtonProps {
    /** The wallet address to share */
    address: string;
    /** Theme flag - true for dark mode, false for light mode */
    isDark: boolean;
    /** Safe area insets for proper spacing on different devices */
    insets: EdgeInsets;
}

/**
 * Animated share button for wallet address distribution
 * 
 * Provides native share functionality with a pre-formatted message including
 * the wallet address and network warning. Features a fade-in and slide-up
 * entrance animation on mount.
 * 
 * @param props - Component properties
 * @returns Rendered share button with animation
 * 
 * @example
 * ```tsx
 * <ShareButton
 *   address="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *   isDark={true}
 *   insets={safeAreaInsets}
 * />
 * ```
 */
export default function ShareButton({
    address,
    isDark,
    insets,
}: ShareButtonProps): JSX.Element {
    const styles = createDepositStyles(isDark, insets);
    const slideAnim = useRef(new Animated.Value(30)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 600,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    /**
     * Handles the share action via native share sheet
     * 
     * Shares a formatted message containing the wallet address
     * with a Devnet-only warning for user safety.
     */
    const handleShare = async () => {
        try {
            await Share.share({
                message: `My wallet address: ${address}\n\n⚠️ This address accepts SOL and SPL tokens on Devnet only.`,
            });
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <Animated.View
            style={[
                styles.buttonContainer,
                { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
        >
            <View style={styles.buttonShadow}>
                <TouchableOpacity
                    style={[styles.button, styles.primaryButton]}
                    onPress={handleShare}
                    activeOpacity={0.8}
                >
                    <MaterialCommunityIcons name="share-variant" size={22} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Share Address</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}