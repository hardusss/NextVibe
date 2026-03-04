import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Nfc } from "lucide-react-native"

export function ShareViaNFC({
    handlePress 
}: { handlePress: () => void }
){
    const styles = getStyles();
    return (
        <TouchableOpacity onPress={handlePress}>
            <LinearGradient
                style={styles.button}
                colors={["#6A00F4", "#8100dd"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                >   
                    <View style={{flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5}}>
                        <Text style={styles.buttonText}>Share via NFC</Text>
                        <Nfc color={"white"} size={16}/>
                    </View>
                    
            </LinearGradient>
        </TouchableOpacity>
    )
}


const getStyles = () => StyleSheet.create({
    button: {
        width: "100%",
        height: 40,
        borderRadius: 14,
        marginVertical: 10,
        marginBottom: 20,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "row",
        gap: 5
    },
    buttonText: {
        includeFontPadding: false,
        color: "white",
        fontSize: 16
    }
})