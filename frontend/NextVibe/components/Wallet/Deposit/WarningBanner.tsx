import { View, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import createDepositStyles from "@/styles/deposit.styles";
import { EdgeInsets } from "react-native-safe-area-context";

/**
 * Props for the WarningBanner component
 */
type WarningBannerProps = {
    /** The asset type or token name to display in the warning (e.g., "SOL", "USDC") */
    label: string;
    /** The blockchain network name - defaults to "Devnet" */
    network?: string;
    /** Theme flag - true for dark mode, false for light mode */
    isDark: boolean;
    /** Safe area insets for proper spacing on different devices */
    insets: EdgeInsets;
};

/**
 * Warning banner for deposit network restrictions
 * 
 * Displays a cautionary message to users about sending assets only on the
 * specified network. Helps prevent loss of funds by ensuring users send
 * tokens on the correct blockchain network.
 * 
 * @param props - Component properties
 * @returns Rendered warning banner with icon and message
 * 
 * @example
 * ```tsx
 * <WarningBanner
 *   label="SOL/SPL
 *   network="Devnet"
 *   isDark={true}
 *   insets={safeAreaInsets}
 * />
 * ```
 */
export default function WarningBanner({
    label,
    network = "Devnet",
    isDark,
    insets
}: WarningBannerProps): JSX.Element {
    const styles = createDepositStyles(isDark, insets);

    return (
        <View style={styles.warningContainer}>
            <MaterialCommunityIcons
                name="alert-circle-outline"
                size={20}
                color={isDark ? '#C4B5FD' : '#7C3AED'}
                style={{ marginTop: 0 }}
            />
            <Text style={styles.warningText}>
                Send only <Text style={{ fontWeight: '700' }}>{label}</Text> on{' '}
                <Text style={{ fontWeight: '700' }}>{network}</Text>.
            </Text>
        </View>
    );
}