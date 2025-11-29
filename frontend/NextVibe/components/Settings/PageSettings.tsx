import React, { useState, useEffect, useRef } from "react";
import {
    ScrollView, View, Text, StatusBar, StyleSheet, useColorScheme,
    Animated, TouchableWithoutFeedback, TouchableOpacity, TextInput, RefreshControl
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import getUserDetail from "@/src/api/user.detail";
import { Switch } from "react-native-paper";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { storage } from '@/src/utils/storage';
import { useFocusEffect } from "expo-router";
import { useCallback } from 'react';
import BottomSheet from "../2FA/Connect";
import updateStatus from "@/src/api/2fa";
import AvatarSheet from "./AvatarSheet";
import LogoutConfirmationSheet from "./LogoutConfirmationSheet";
import ResetPasswordSheet from "./ResetPasswordSheet";
import resetAvatar from "@/src/api/reset.avatar";
import { PopupProvider, usePopup } from "../Popup";
import updateUser from "@/src/api/update.user";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import ConfirmDialog from "../Shared/Toasts/ConfirmDialog";
import Web3Toast from "../Shared/Toasts/Web3Toast";

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
    background: "#0A0410",
    cardBackground: "#0A0410",
    inputBackground: "#0A0410",
    primary: "#58a6ff",
    secondary: "#1f6feb",
    textPrimary: "#c9d1d9",
    textSecondary: "#8b949e",
    border: "#3b0076ff",
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

function PageSettingsContent() {
    const [isVisibleAvatar, setIsVisableAvatar] = useState<boolean>(false);
    const [isVisable2FA, setIsVisable2FA] = useState<boolean>(false);
    const [isVisibleLogoutConfirmation, setIsVisibleLogoutConfirmation] = useState<boolean>(false);
    const [isVisibleResetPassword, setIsVisibleResetPassword] = useState<boolean>(false);
    const [user, setUser] = useState<User | null>(null);
    const [username, setUsername] = useState("");
    const [about, setAbout] = useState("");
    const [twoFA, setTwoFA] = useState<boolean>(false)
    const [refreshing, setRefreshing] = useState(false);
    const [isSave, setIsSave] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);
    const [showConfirm, setShowConfirm] = useState(false);
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [toastSuccess, setToastSuccess] = useState(true);

    const router = useRouter();
    const isDark = useColorScheme() === "dark";
    const styles = getStyles(isDark);
    const { showPopup } = usePopup();
    
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
            GoogleSignin.configure({
               webClientId: '1063264156706-l99os5o2se3h9rs8tcuuolo3kfio7osn.apps.googleusercontent.com',
               offlineAccess: true,
            });
    }, []);

    const handleLogoutConfirm = () => {
        storage.clearAll();
        AsyncStorage.clear();
        GoogleSignin.signOut();
        setIsVisibleLogoutConfirmation(false); 
        router.replace("/register");
    }

    const handleLogout = () => {
        setIsVisibleLogoutConfirmation(true);
    }

    const handleBackPress = () => {
        if (isSave) {
            setShowConfirm(true); 
        } else {
            router.back();
        }
    };

    const showToast = (message: string, isSuccess: boolean) => {
        setToastMessage(message);
        setToastSuccess(isSuccess);
        setToastVisible(true);
    };



    const fetchUserData = async () => {
        setLoading(true);
        try {
            const response = await getUserDetail();
            setTwoFA(response.is2FA)
            setUser(response);
            setUsername(response.username);
            setAbout(response.about);
        } catch (error) {
            console.error("Failed to fetch user data:", error);
            showToast('Failed to load user data', false);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            if (!username) {
                showToast('Username cannot be empty', false);
                return;
            }

            if (username !== user?.username) {
                const usernameResponse = await updateUser(username, undefined);
                if (usernameResponse?.status !== 200) {
                    if (usernameResponse === null) {
                        showToast('Failed to update. Username are already taken!', false);
                        return;
                    }
                    showToast(`${usernameResponse?.data.error}`, false);
                    return;
                }
            }


            if (about !== user?.about) {
                const aboutResponse = await updateUser(undefined, about);
                if (aboutResponse === null) {
                    showToast('Failed to update about', false);
                    return;
                }
                if (aboutResponse?.status !== 200) {
                    showToast(`${aboutResponse?.data.error}`, false);
                    return;
                }
            }

            if (username !== user?.username && about!== user?.about) {
                const response = await updateUser(username, about);
                if (response === null) {
                    showToast('Failed to update profile', false);
                    return;
                }
                if (response?.status !== 200) {
                    showToast(`${response?.data.error}`, false);
                    return;
                }
            }

            await fetchUserData();
            showToast('Your profile has been successfully updated', true);
            setIsSave(false);
        } catch (error) {
            console.error('Update error:', error);
            showToast('Failed to update profile', false);
        }
    }
    const handleOpenEdit = () => {
        setIsVisableAvatar((prev) => !prev)
    }
    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            fetchUserData();
            
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }).start();

            setIsVisibleLogoutConfirmation(false);
            
            return () => {
                setUser(null);
                setAbout("");
                setUsername("");
                setIsVisibleLogoutConfirmation(false); 
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

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        setUser(null);
        setAbout("");
        setUsername("");
        await fetchUserData();
        setRefreshing(false);
    }, []);

    useEffect(() => {
        if (user) {
            const isUsernameChanged = username !== user.username;
            const isAboutChanged = about !== user.about;
            setIsSave(isUsernameChanged || isAboutChanged);
        }
    }, [username, about, user]);

    const SkeletonAvatar = () => (
        <View style={[styles.image, { backgroundColor: isDark ? '#333' : '#ddd' }]} />
    );

    const SkeletonText = ({ width, height = 15 }: {width: number, height: number}) => (
        <View 
            style={{
                width: width,
                height: height,
                backgroundColor: isDark ? '#333' : '#ddd',
                borderRadius: 4,
                marginVertical: 5
            }}
        />
    );

    const SkeletonInput = () => (
        <View 
            style={{
                height: 30,
                backgroundColor: isDark ? '#333' : '#ddd',
                borderRadius: 4,
                marginTop: 5,
                width: '100%'
            }}
        />
    );

    return (
        <Animated.View style={[styles.container, { opacity: fadeAnim, position: "relative" }]}>
            <ConfirmDialog
                visible={showConfirm}
                title="Save changes?"
                message="You have unsaved changes. Do you want to save them before leaving?"
                confirmLabel="Save"
                cancelLabel="Discard"
                onConfirm={async () => {
                    await handleSave(); 
                    setShowConfirm(false);
                    router.back();
                }}
                onCancel={() => {
                    setShowConfirm(false);
                    router.back(); 
                }}
            />

            <Web3Toast 
                message={toastMessage} 
                visible={toastVisible} 
                isSuccess={toastSuccess} 
                onHide={() => setToastVisible(false)} 
            />

            <StatusBar backgroundColor={isDark ? darkColors.background : lightColors.background} />
            <View style={styles.header}>
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={handleBackPress}>
                    <MaterialCommunityIcons name="arrow-left" style={styles.icon} />
                </TouchableOpacity>
                <Text style={styles.title}>Settings Profile</Text>

                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                    style={{
                        backgroundColor: isSave ? "#3b0076ff" : "#262626",
                        padding: 5,
                        borderRadius: 5,
                        alignItems: "center",
                        position: "absolute",
                        right: 10,
                        paddingHorizontal: 10,
                    }} 
                    disabled={!isSave}
                    onPress={handleSave}
                >
                    <Text style={{color: isSave ? "white": "gray", fontWeight: "bold"}}>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView 
                contentContainerStyle={styles.contentContainer}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={isDark ? "#fff" : "#000"}
                        colors={["#05f0d8"]}
                        progressBackgroundColor={isDark ? "#000" : "#fff"}
                    />
                }
            >
                {loading ? (
                    <>
                        <View style={styles.centeredView}>
                            <View style={styles.imageContainer}>
                                <SkeletonAvatar />
                            </View>
                            <SkeletonText width={150} height={15}/>
                        </View>

                        <View style={styles.inputContainer}>
                            <SkeletonText width={100} height={15}/>
                            <SkeletonInput />
                        </View>

                        <View style={styles.inputContainer}>
                            <SkeletonText width={80} height={15}/>
                            <SkeletonInput />
                        </View>
                    </>
                ) : (
                    <>
                        <View style={styles.centeredView}>
                            <View style={styles.imageContainer}>
                                <TouchableWithoutFeedback onPressIn={() => {handlePressIn(); handleOpenEdit()}} onPressOut={handlePressOut}>
                                    <Animated.Image
                                        style={[styles.image, { transform: [{ scale: scaleAnim }] }]}
                                        source={{ uri: `${user?.avatar}` }}
                                    />
                                </TouchableWithoutFeedback>
                            </View>
                            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={handleOpenEdit}>
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
                    </>                    
                )}

                {loading ? (
                    <>
                        <View style={{flexDirection: "row", justifyContent: "space-between", marginTop: 20}}>
                            <SkeletonText width={80} height={15}/>
                            <View style={{ width: 40, height: 20, backgroundColor: isDark ? '#333' : '#ddd', borderRadius: 10 }} />
                        </View>
                        <SkeletonText width={120} height={20} />
                        <SkeletonText width={80} height={20} />
                    </>
                ) : (
                    <>
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
                        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} style={{marginTop: 15}} onPress={() => setIsVisibleResetPassword(true)}>
                            <Text style={{color: "#7b05f1ff", fontWeight: "bold"}}>Reset password</Text>
                        </TouchableOpacity>

                        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} style={{marginTop: 15}} onPress={handleLogout}>
                            <Text style={{color: "red", fontWeight: "bold"}}>Log out</Text>
                        </TouchableOpacity>
                    </>
                )
                }
            </ScrollView>
            <AvatarSheet isVisible={isVisibleAvatar} onClose={() => setIsVisableAvatar((prev)=>!prev)} onReset={() => resetAvatar()}></AvatarSheet>
            <BottomSheet isVisible={isVisable2FA} onClose={() => setIsVisable2FA(false)} onSuccess={() => {setTwoFA(true); updateStatus(true)}} onFail={() => {setTwoFA(false); updateStatus(false)}}></BottomSheet>
            <LogoutConfirmationSheet 
                isVisible={isVisibleLogoutConfirmation} 
                onClose={() => {setIsVisibleLogoutConfirmation(false)}} 
                onConfirm={handleLogoutConfirm} 
            />
            <ResetPasswordSheet 
                isVisible={isVisibleResetPassword} 
                onClose={() => setIsVisibleResetPassword(false)} 
                onSuccess={() => {
                    showPopup('success', 'Success', 'Your password has been successfully changed');
                    setIsVisibleResetPassword(false);
                }} 
            />
        </Animated.View>
    );
}

export default function PageSettings() {
    return (
        <PopupProvider>
            <PageSettingsContent />
        </PopupProvider>
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
            borderColor: "#8000ffff",
            borderRadius: 55,
            padding: 2
        },
        image: {
            width: 100,
            height: 100,
            borderRadius: 50,
        },
        linkText: {
            color: "#7b05f1ff",
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
            borderBottomColor: "#5700afff",
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
