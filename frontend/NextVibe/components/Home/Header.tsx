import { TouchableOpacity, Text, View, StyleSheet, Animated } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColorScheme } from "react-native";
import { useRouter } from "expo-router";
import FastImage from 'react-native-fast-image';


interface HeaderProps {
    translateY?: Animated.AnimatedInterpolation<string | number>;
}

export default function Header({ translateY }: HeaderProps) {
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();
    const styles = getStyles(isDark);
    return (
        <View style={[
                    styles.container,
                    translateY ? { transform: [{ translateY }] } : null
                ]}>
                <View style={{flexDirection: "row", alignItems: "center", width: "100%", justifyContent: "space-between"}}>
                    
                    <Text style={styles.text}>NextVibe</Text>
                    <FastImage 
                        source={require('@/assets/logo.png')} 
                        style={{ width: 50, height: 50, marginTop: 5 }}
                        resizeMode={FastImage.resizeMode.contain}
                    />
                </View>
    
            <TouchableOpacity style={styles.messageButton} onPress={() => router.push("/chats")}>
                <Text style={styles.messageButtonText}>Message</Text>
            </TouchableOpacity>
        </View>
    )
}

const getStyles = (isDark: boolean) => {
    return StyleSheet.create({
        container: {
            backgroundColor: isDark ? '#130E1D' : '#fff',
            zIndex: 100,
            paddingVertical: 10,
            paddingHorizontal: 10,
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        messageButton: {
            backgroundColor: isDark ? '#D9D9D9' : '#130E1D',
            width: "100%",
            height: 50,
            borderRadius: 12,
            justifyContent: "center",
            alignItems: "center"
        },
        messageButtonText: {
            color: isDark ? '#130E1D' : '#D9D9D9',
            fontSize: 16,
            fontWeight: "bold"
        },
        text: { 
            fontSize: 35,
            fontWeight: 'bold',
            color: isDark? '#D9D9D9' : 'black',
        },
        chat: {
            marginRight: 10,
            fontSize: 30,
            alignSelf: 'center',
            color: isDark ? '#fff' : 'black',
        }
    }) 
}