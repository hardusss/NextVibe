import { View, Text } from "react-native"
import createTransactionStyles from "@/styles/create.transaction.style";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function LazorKitShield ({ isDark }: {isDark: boolean}) {
    const styles = createTransactionStyles(isDark);

    return (
        <>
            {/* LazorKit Shield */}
            <View style={styles.gaslessContainer}>
                <BlurView intensity={isDark ? 40 : 80} tint={isDark ? 'dark' : 'light'} style={styles.blurViewAbsolute} />
                <View style={styles.gaslessContent}>
                    <View style={styles.shieldIconContainer}>
                        <LinearGradient
                            colors={['#2ECC71', '#27AE60']}
                            style={{ width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }}
                        >
                            <MaterialCommunityIcons name="shield-check" size={22} color="#fff" />
                        </LinearGradient>
                    </View>
                    <View style={styles.gaslessTextContainer}>
                        <Text style={styles.gaslessTitle}>LazorKit Protected</Text>
                        <Text style={styles.gaslessSubtitle}>Gasless transaction via FaceID</Text>
                    </View>
                    <View style={styles.freeBadge}>
                        <Text style={styles.freeText}>FREE</Text>
                    </View>
                </View>
            </View>
        </>
    );
};