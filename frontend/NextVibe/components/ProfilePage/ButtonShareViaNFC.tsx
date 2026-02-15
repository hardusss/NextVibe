import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";


export function ShareViaNFC(){
    const styles = getStyles();
    return (
        <TouchableOpacity >
            <LinearGradient
                style={styles.button}
                colors={["#6A00F4", "#8100dd"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                >   
                    <View style={{flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5}}>
                        <Text style={styles.buttonText}>Share via NFC</Text>
                        <MaterialCommunityIcons name="nfc" color={"white"} size={16}/>
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
        fontWeight: 600,
        fontSize: 16
    }
})