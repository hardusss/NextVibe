import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Users } from "lucide-react-native";

export function InviteSecondaryButton({
    handlePress 
}: { handlePress: () => void }
){
    const styles = getStyles();
    
    return (
        <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
            <LinearGradient
                style={styles.button}
                /** * Using a muted gradient for the secondary hierarchy.
                 * Falls back to the dark theme palette to avoid competing with primary CTAs.
                 */
                colors={["#2D1B4E", "#1F1235"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
            >   
                <View style={styles.contentWrap}>
                    <Users color={"#d8b4fe"} size={16} strokeWidth={2} />
                    <Text style={styles.buttonText}>Invite</Text>
                </View>
            </LinearGradient>
        </TouchableOpacity>
    );
}

const getStyles = () => StyleSheet.create({
    button: {
        width: "100%",
        height: 44, 
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
    },
    contentWrap: {
        flexDirection: "row", 
        justifyContent: "center", 
        alignItems: "center", 
        gap: 6
    },
    buttonText: {
        includeFontPadding: false,
        color: "#d8b4fe", 
        fontSize: 15,
        fontWeight: "600",
    }
});