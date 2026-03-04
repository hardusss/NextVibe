import { View, TouchableOpacity, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import createDepositStyles from "@/styles/deposit.styles";
import { EdgeInsets } from "react-native-safe-area-context";

/**
 * Props for the AddressBox component
 */
interface AddressBoxProps {
    /** Cryptocurrency or wallet address to display */
    address: string;
    /** Theme flag - true for dark mode, false for light mode */
    isDark: boolean;
    /** Safe area insets for proper spacing on different devices */
    insets: EdgeInsets;
    /** Callback fired when the address box is pressed to copy */
    onCopy: () => void;
}

/**
 * Interactive address display component with copy functionality
 * 
 * Displays a cryptocurrency/wallet address with middle ellipsis truncation
 * and a copy icon. The entire component is tappable to trigger the copy action.
 * 
 * @param props - Component properties
 * @returns Rendered address box with copy interaction
 * 
 * @example
 * ```tsx
 * <AddressBox
 *   address="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *   isDark={true}
 *   insets={safeAreaInsets}
 *   onCopy={() => {
 *     Clipboard.setString(address);
 *     Toast.show('Address copied');
 *   }}
 * />
 * ```
 */
export default function AddressBox({
    address,
    isDark,
    insets,
    onCopy
}: AddressBoxProps) {
    const styles = createDepositStyles(isDark, insets);

    return (
        <>
            <View style={styles.addressContainerShadow}>
                <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.addressContainer}
                    onPress={onCopy}
                    activeOpacity={0.6}
                >
                    <View style={styles.addressTextContainer}>
                        <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                            {address}
                        </Text>
                        <View style={styles.copyIconContainer}>
                            <MaterialCommunityIcons
                                name="content-copy"
                                size={16}
                                color={isDark ? '#A78BFA' : '#6D28D9'}
                            />
                        </View>
                    </View>
                </TouchableOpacity>
            </View>
        </>
    );
};