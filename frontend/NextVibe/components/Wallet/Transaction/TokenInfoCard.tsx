import { View, Text, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import FastImage from "react-native-fast-image";
import createTransactionStyles from "@/styles/create.transaction.style";
import { useRouter } from "expo-router";
import formatValue from "@/src/utils/solana/formatValue";

interface TokenInfoCardProps {
    tokenName: string;
    tokenSymbol: string;
    tokenIcon: string;
    usdValue: number;
    balance: number;
    isDark: boolean;
}

export default function TokenInfoCard ({
    tokenName,
    tokenSymbol,
    tokenIcon,
    usdValue,
    balance,
    isDark,
}: TokenInfoCardProps) {
    const styles = createTransactionStyles(isDark);
    const router = useRouter();

    return (
        <>
            {/* Token Info Card - Using Cached Data to prevent Flicker */}
                    <View style={styles.tokenInfoContainer}>
                        <BlurView intensity={isDark ? 30 : 90} tint={isDark ? 'dark' : 'light'} style={styles.blurViewAbsolute} />
                        <View style={styles.tokenRow}>
                            <View style={styles.tokenLeft}>
                                {tokenIcon ? (
                                    <FastImage 
                                        source={{ uri: tokenIcon }} 
                                        style={styles.tokenIcon} 
                                        resizeMode={FastImage.resizeMode.cover}
                                    />
                                ) : (
                                    <View style={styles.tokenIcon}>
                                         <Text style={{color: '#fff', fontWeight: 'bold'}}>{tokenSymbol}</Text>
                                    </View>
                                )}
                                
                                <View>
                                    <Text style={styles.tokenName}>{tokenName}</Text>
                                    <TouchableOpacity style={styles.switchButton} onPress={() => router.push("/select-token")}>
                                        <Text style={styles.switchButtonText}>Switch token</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                            <View style={styles.balanceContainer}>
                                <Text style={styles.balanceText}>${formatValue(usdValue, 2)}</Text>
                                <Text style={styles.tokensAvailable}>{formatValue(balance, 5)} {tokenSymbol}</Text>
                            </View>
                        </View>
                    </View>
        </>
    )
}