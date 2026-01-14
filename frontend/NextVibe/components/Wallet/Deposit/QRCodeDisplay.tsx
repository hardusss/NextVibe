import { Animated, View, Image, Text } from "react-native";
import { useEffect, useRef } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import createDepositStyles from "@/styles/deposit.styles";

const APP_LOGO = require("@/assets/images/icon.png");

/**
 * Props for the QRCodeDisplay component
 */
interface QRCodeDisplayProps {
    /** The address/data to encode in the QR code */
    address: string;
    /** Theme flag - true for dark mode, false for light mode */
    isDark: boolean;
}

/**
 * Animated QR code display with centered logo and network badge
 * 
 * Renders a QR code with the app logo overlaid in the center, featuring a spring
 * animation on mount. Includes a "Devnet Only" badge to indicate test network usage.
 * Uses high error correction level (H) to maintain scannability despite logo overlay.
 * 
 * @param props - Component properties
 * @returns Rendered QR code with logo and network badge
 * 
 * @example
 * ```tsx
 * <QRCodeDisplay
 *   address="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *   isDark={true}
 * />
 * ```
 */
export default function QRCodeDisplay({
    address,
    isDark
}: QRCodeDisplayProps) {
    const insets = useSafeAreaInsets();
    const styles = createDepositStyles(isDark, insets);
    const qrScale = useRef(new Animated.Value(0.9)).current;

    useEffect(() => {
        Animated.spring(qrScale, {
            toValue: 1,
            tension: 40,
            friction: 8,
            useNativeDriver: true,
        }).start();
    }, []);

    return (
        <Animated.View
            style={[
                styles.qrSection,
                { transform: [{ scale: qrScale }] },
            ]}
        >
            {/* QR Code with centered logo */}
            <View style={styles.qrCodeContainer}>
                <QRCode
                    value={address || ''}
                    size={160}
                    backgroundColor="transparent"
                    color="#000000"
                    ecl="H"
                />
                <View style={styles.logoWrapper}>
                    <Image
                        source={APP_LOGO}
                        style={styles.logoImage}
                        resizeMode="contain"
                    />
                </View>
            </View>

            {/* Network indicator badge */}
            <View style={styles.networkBadge}>
                <MaterialCommunityIcons
                    name="flask"
                    size={14}
                    color={isDark ? '#FFA500' : '#D2691E'}
                />
                <Text style={styles.networkBadgeText}>Devnet Only</Text>
            </View>
        </Animated.View>
    );
}