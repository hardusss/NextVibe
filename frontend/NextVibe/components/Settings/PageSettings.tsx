import React, { useState, useEffect, useRef } from "react";
import {
    ScrollView, View, Text, StatusBar, StyleSheet, useColorScheme,
    Animated, TouchableWithoutFeedback, TouchableOpacity, TextInput
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import getUserDetail from "@/src/api/user.detail";
import GetApiUrl from "@/src/utils/url_api";
import { Switch } from "react-native-paper";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback } from 'react';
import BottomSheet from "../2FA/Connect";
import updateStatus from "@/src/api/2fa";
import { setTSpan } from "react-native-svg/lib/typescript/lib/extract/extractText";

interface User {
    username: string;
    about: string;
    avatar: string | null;
    post_count: number;
    readers_count: number;
    follows_count: number;
    official: boolean;
}

const darkColors = {
    background: "black",
    cardBackground: "black",
    inputBackground: "black",
    primary: "#58a6ff",
    secondary: "#1f6feb",
    textPrimary: "#c9d1d9",
    textSecondary: "#8b949e",
    border: "#fafafa",
    shadow: "#0917b3",
};

const lightColors = {
    background: "#ffffff",
    cardBackground: "#f5f5f5",
    inputBackground: "#ffffff",
    primary: "#007bff",
    secondary: "#0056b3",
    textPrimary: "#000000",
    textSecondary: "#666666",
    border: "#cccccc",
    shadow: "#000000",
};

export default function PageSettings() {
    const [isVisable2FA, setIsVisable2FA] = useState<boolean>(false);
    const [user, setUser] = useState<User | null>(null);
    const [username, setUsername] = useState("");
    const [about, setAbout] = useState("");
    const [twoFA, setTwoFA] = useState<boolean>(false)
    const [enableCodePassword, setEnableCodePassword] = useState<boolean>(false);
    const router = useRouter();
    const isDark = useColorScheme() === "dark";
    const styles = getStyles(isDark);
    
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    const handleLogout = () => {
        AsyncStorage.clear()
        router.push("/register")
    }

    const fetchUserData = async () => {
        const response = await getUserDetail();
        setTwoFA(response.is2FA)
        setUser(response);
        setUsername(response.username);
        setAbout(response.about);
    };

    useFocusEffect(
        useCallback(() => {
            
            fetchUserData();
            
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }).start();
            return () => {
                setUser(null);
                setAbout("");
                setUsername("");
            }
        }, []) 
    )

    const handlePressIn = () => {
        Animated.timing(scaleAnim, {
            toValue: 0.9,
            duration: 150,
            useNativeDriver: true,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 5,
            tension: 50,
            useNativeDriver: true,
        }).start();
    };

    return (
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}> 
            <StatusBar backgroundColor={isDark ? darkColors.background : lightColors.background} />
            
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.push("/profile")}>
                    <MaterialCommunityIcons name="arrow-left" style={styles.icon} />
                </TouchableOpacity>
                <Text style={styles.title}>Settings Profile</Text>
            </View>

            <ScrollView contentContainerStyle={styles.contentContainer}>
                <View style={styles.centeredView}>
                    <View style={styles.imageContainer}>
                        <TouchableWithoutFeedback onPressIn={handlePressIn} onPressOut={handlePressOut}>
                            <Animated.Image
                                style={[styles.image, { transform: [{ scale: scaleAnim }] }]}
                                source={{ uri: `${GetApiUrl().slice(0, 25)}${user?.avatar}` }}
                            />
                        </TouchableWithoutFeedback>
                    </View>
                    <TouchableOpacity>
                        <Text style={styles.linkText}>Edit or remove avatar</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Username</Text>
                    <TextInput style={styles.input} value={username} onChangeText={setUsername} />
                </View>

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>About</Text>
                    <TextInput style={styles.input} value={about} onChangeText={setAbout} multiline />
                </View>

                <View style={{flexDirection: "row", justifyContent: "space-between", marginTop: 20}}>
                    <Text style={styles.label}>Enable 2FA</Text>
                    <Switch value={twoFA} onValueChange={() => {
                       if (twoFA === false) {
                        setIsVisable2FA(true);
                       };
                       if (twoFA === true) {
                        updateStatus(false);
                        setTwoFA(false)
                       }
                    }}
                        disabled={false}
                        trackColor={{ false: "#767577", true: "#05f0d8" }}
                        thumbColor={twoFA ? "#fff" : "#f4f3f4"}>
                    </Switch>
                </View>
                <View style={{flexDirection: "row", justifyContent: "space-between", marginTop: 15}}>
                    <View style={{flexDirection: "row"}}>  
                        <MaterialCommunityIcons name="lock" style={[styles.label, {marginTop: 2}]}/>
                        <Text style={styles.label}>Code-password</Text>
                    </View>
                    <Switch value={enableCodePassword} onValueChange={() => setEnableCodePassword(!enableCodePassword)}
                        disabled={false}
                        trackColor={{ false: "#767577", true: "#05f0d8" }}
                        thumbColor={enableCodePassword ? "#fff" : "#f4f3f4"}>
                    </Switch>
            </View>
            <TouchableOpacity style={{marginTop: 15}}>
                    <Text style={{color: "#05f0d8", fontWeight: "bold"}}>Reset password</Text>
            </TouchableOpacity>

            <TouchableOpacity style={{marginTop: 15}} onPress={handleLogout}>
                    <Text style={{color: "red", fontWeight: "bold"}}>Log out</Text>
            </TouchableOpacity>
            </ScrollView>
            <BottomSheet isVisible={isVisable2FA} onClose={() => setIsVisable2FA(false)} onSuccess={() => {setTwoFA(true); updateStatus(true)}} onFail={() => {setTwoFA(false); updateStatus(false)}}></BottomSheet>
        </Animated.View>
    );
}
const getStyles = (isDark: boolean) => {
    return StyleSheet.create({
        container: {
            backgroundColor: isDark ? darkColors.background : lightColors.background,
            flex: 1,
        },
        header: {
            flexDirection: "row",
            alignItems: "center",
            padding: 15,
            backgroundColor: isDark ? darkColors.cardBackground : lightColors.cardBackground,
            elevation: 5,
        },
        icon: {
            color: isDark ? darkColors.textPrimary : lightColors.textPrimary,
            fontSize: 30,
        },
        title: {
            fontSize: 24,
            fontWeight: "bold",
            color: isDark ? darkColors.textPrimary : lightColors.textPrimary,
            marginLeft: 20,
        },
        contentContainer: {
            padding: 20,
        },
        centeredView: {
            alignItems: "center",
        },
        imageContainer: {
            borderWidth: 1,
            borderColor: "#05f0d8",
            borderRadius: 55,
            padding: 2
        },
        image: {
            width: 100,
            height: 100,
            borderRadius: 50,
        },
        linkText: {
            color: "blue",
            fontWeight: "bold",
            marginTop: 10,
        },
        inputContainer: {
            marginTop: 20,
        },
        label: {
            fontSize: 16,
            color: isDark ? darkColors.textSecondary : lightColors.textSecondary,
            marginBottom: 5,
        },
        input: {
            backgroundColor: isDark ? darkColors.inputBackground : lightColors.inputBackground,
            color: isDark ? darkColors.textPrimary : lightColors.textPrimary,
            paddingBottom: 5,
            paddingTop: 5,
            fontSize: 16,
            borderBottomColor: "#05f0d8",
            borderBottomWidth: 1
        },
        twoFAButton: {
            marginTop: 30,
            padding: 15,
            width: 150,
            borderRadius: 10,
            backgroundColor: "#1f6feb",
            alignItems: "center",
        },
        buttonText: {
            color: "white",
            fontSize: 16,
            fontWeight: "bold",
        },
    });
};
