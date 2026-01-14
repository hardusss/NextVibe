import { View, Image, Text } from "react-native";
import { TOKENS } from "@/constants/Tokens";
import { EdgeInsets } from "react-native-safe-area-context";
import createDepositStyles from "@/styles/deposit.styles";

/**
 * Token type derived from the TOKENS constant
 */
type Token = typeof TOKENS[keyof typeof TOKENS];

/**
 * Props for the SupportedTokens component
 */
interface SupportedTokensProps {
    /** Array of token objects to display */
    tokens: Token[];
    /** Theme flag - true for dark mode, false for light mode */
    isDark: boolean;
    /** Safe area insets for proper spacing on different devices */
    insets: EdgeInsets;
}

/**
 * Horizontal list of supported tokens with icons and symbols
 * 
 * Displays a scrollable row of token items, each showing the token's logo
 * and symbol. Typically used to indicate which tokens are accepted for
 * deposits or transactions.
 * 
 * @param props - Component properties
 * @returns Rendered horizontal token list
 * 
 * @example
 * ```tsx
 * <SupportedTokens
 *   tokens={[TOKENS.SOL, TOKENS.USDC]}
 *   isDark={true}
 *   insets={safeAreaInsets}
 * />
 * ```
 */
export default function SupportedTokens({
    tokens,
    isDark,
    insets
}: SupportedTokensProps) {
    const styles = createDepositStyles(isDark, insets);

    return (
        <View style={styles.tokensRow}>
            {tokens.map((token) => (
                <View key={token.symbol} style={styles.tokenItemShadow}>
                    <View style={styles.tokenItem}>
                        <Image
                            source={{ uri: token.logoURL }}
                            style={styles.tokenIcon}
                        />
                        <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                    </View>
                </View>
            ))}
        </View>
    );
}