import { TouchableOpacity, Text, View, Image, StyleSheet, Animated } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColorScheme } from "react-native";
import { useRouter } from "expo-router";

interface HeaderProps {
    translateY?: Animated.AnimatedInterpolation<string | number>;
}

export default function Header({ translateY }: HeaderProps) {
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();
    const styles = getStyles(isDark);
    return (
        <Animated.View 
            style={[
                styles.container,
                translateY ? { transform: [{ translateY }] } : null
            ]}
        >
            <View style={{flexDirection: "row", alignItems: "center"}}>
                <Image source={require('@/assets/logo.png')} style={{ width: 50, height: 50, marginLeft: 10, objectFit: "contain" }} />
                <Text style={styles.text}>extVibe</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/chats")}>
                <MaterialCommunityIcons name="chat-outline" style={styles.chat}/>
            </TouchableOpacity>
        </Animated.View>
    )
}

const getStyles = (isDark: boolean) => {
    return StyleSheet.create({
        container: {
            backgroundColor: isDark ? 'black' : '#fff',
            flexDirection: 'row',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            padding: 10,
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 70,
            borderBottomWidth: 0.2,
            borderBottomColor: "white"
        },
        text: { 
            marginLeft: -10,
            fontSize: 25,
            fontWeight: 'bold',
            color: isDark? '#fff' : 'black',
        },
        chat: {
            marginRight: 10,
            fontSize: 30,
            alignSelf: 'center',
            color: isDark ? '#fff' : 'black',
        }
    }) 
}