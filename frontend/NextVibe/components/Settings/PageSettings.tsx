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
import validationUsername from "@/src/validation/username-update-validator";

import useWalletAddress from "@/hooks/useWalletAddress";

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
    inputBackground: "transparent",
    textPrimary: "#ffffff",
    textSecondary: "#8b949e",
    border: "#1F152E",
    accent: "#05f0d8",
    link: "#a371f7",
    danger: "#ff4d4d",
    saveActive: "#a371f7",
    saveInactive: "#302640"
};

const lightColors = {
    background: "#ffffff",
    inputBackground: "transparent",
    textPrimary: "#000000",
    textSecondary: "#666666",
    border: "#eeeeee",
    accent: "#05f0d8",
    link: "#7b05f1",
    danger: "#ef4444",
    saveActive: "#7b05f1",
    saveInactive: "#e5e5e5"
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
    const { address, disconnect } = useWalletAddress();

    const router = useRouter();
    const isDark = useColorScheme() === "dark";
    const colors = isDark ? darkColors : lightColors;
    const styles = getStyles(colors);
    const { showPopup } = usePopup();
    
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        GoogleSignin.configure({
            webClientId: '1063264156706-l99os5o2se3h9rs8tcuuolo3kfio7osn.apps.googleusercontent.com',
            offlineAccess: true,
        });
    }, []);

    const handleLogoutConfirm = async () => {
        storage.clearAll();
        AsyncStorage.clear();
        GoogleSignin.signOut();
        setIsVisibleLogoutConfirmation(false); 
        if (address) {
            await disconnect();
        }
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
            const validUsername = validationUsername(username);
            if (!validUsername.ok){
                showToast(validUsername.error as string, false)
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
                if (about.length > 255) {
                    showToast("The about can be a maximum of 255 characters!", false)
                    return;
                }
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

    const handleToggle2FA = () => {
        if (twoFA === false) {
            setIsVisable2FA(true);
        } else {
            updateStatus(false);
            setTwoFA(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            fetchUserData();
            
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 400,
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
            toValue: 0.95,
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
        <View style={[styles.image, { backgroundColor: colors.border }]} />
    );

    const SkeletonText = ({ width, height = 14 }: {width: number | string, height?: number}) => (
        <View 
            style={{
                width: width,
                height: height,
                backgroundColor: colors.border,
                borderRadius: 4,
                marginVertical: 4
            }}
        />
    );

    return (
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
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

            <StatusBar backgroundColor={colors.background} barStyle={isDark ? "light-content" : "dark-content"} />
            
            <View style={styles.header}>
                <TouchableOpacity hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={handleBackPress}>
                    <MaterialCommunityIcons name="arrow-left" style={styles.icon} />
                </TouchableOpacity>
                <Text style={styles.title}>Profile</Text>
                <TouchableOpacity 
                    hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                    disabled={!isSave}
                    onPress={handleSave}
                >
                    <Text style={[styles.saveText, isSave ? styles.saveTextActive : styles.saveTextInactive]}>
                        Save
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView 
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.textPrimary}
                        colors={[colors.accent]}
                        progressBackgroundColor={colors.background}
                    />
                }
            >
                {loading ? (
                    <>
                        <View style={styles.centeredView}>
                            <SkeletonAvatar />
                            <View style={{marginTop: 16}}><SkeletonText width={100} height={16} /></View>
                        </View>

                        <View style={styles.section}>
                            <SkeletonText width={70} height={12} />
                            <View style={{marginTop: 8}}><SkeletonText width="100%" height={24} /></View>
                        </View>
                        
                        <View style={styles.section}>
                            <SkeletonText width={50} height={12} />
                            <View style={{marginTop: 8}}><SkeletonText width="100%" height={40} /></View>
                        </View>
                    </>
                ) : (
                    <>
                        <View style={styles.centeredView}>
                            <TouchableWithoutFeedback onPressIn={() => {handlePressIn(); handleOpenEdit()}} onPressOut={handlePressOut}>
                                <Animated.Image
                                    style={[styles.image, { transform: [{ scale: scaleAnim }] }]}
                                    source={{ uri: `${user?.avatar}` }}
                                />
                            </TouchableWithoutFeedback>
                            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={handleOpenEdit}>
                                <Text style={styles.linkText}>Change Photo</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.label}>USERNAME</Text>
                            <TextInput 
                                style={styles.input} 
                                value={username} 
                                onChangeText={setUsername}
                                placeholderTextColor={colors.textSecondary}
                                selectionColor={colors.accent}
                            />
                        </View>
                        
                        <View style={styles.section}>
                            <Text style={styles.label}>ABOUT</Text>
                            <TextInput 
                                style={[styles.input, { minHeight: 40 }]} 
                                value={about} 
                                onChangeText={setAbout} 
                                multiline 
                                placeholderTextColor={colors.textSecondary}
                                selectionColor={colors.accent}
                            />
                        </View>

                        <View style={styles.spacer} />

                        <TouchableOpacity 
                            style={styles.row} 
                            onPress={handleToggle2FA}
                            activeOpacity={0.6}
                        >
                            <Text style={styles.rowText}>Two-Factor Authentication</Text>
                            <View pointerEvents="none">
                                <Switch 
                                    value={twoFA} 
                                    trackColor={{ false: colors.border, true: colors.accent }}
                                    thumbColor={colors.background}
                                />
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={styles.row} 
                            onPress={() => setIsVisibleResetPassword(true)}
                        >
                            <Text style={styles.linkTextMain}>Reset Password</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={[styles.row, styles.lastRow]} 
                            onPress={handleLogout}
                        >
                            <Text style={styles.dangerText}>Sign Out</Text>
                        </TouchableOpacity>
                    </>                    
                )}
            </ScrollView>
            
            <AvatarSheet isVisible={isVisibleAvatar} onClose={() => setIsVisableAvatar((prev)=>!prev)} onReset={() => resetAvatar()} />
            <BottomSheet isVisible={isVisable2FA} onClose={() => setIsVisable2FA(false)} onSuccess={() => {setTwoFA(true); updateStatus(true)}} onFail={() => {setTwoFA(false); updateStatus(false)}} />
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

const getStyles = (colors: any) => {
    return StyleSheet.create({
        container: {
            backgroundColor: colors.background,
            flex: 1,
        },
        header: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 24,
            paddingVertical: 16,
            backgroundColor: colors.background,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        icon: {
            color: colors.textPrimary,
            fontSize: 24,
        },
        title: {
            fontSize: 18,
            fontWeight: "600",
            color: colors.textPrimary,
            letterSpacing: 0.5,
        },
        saveText: {
            fontSize: 16,
            fontWeight: "600",
        },
        saveTextActive: {
            color: colors.saveActive,
        },
        saveTextInactive: {
            color: colors.saveInactive,
        },
        contentContainer: {
            padding: 24,
            paddingBottom: 60,
        },
        centeredView: {
            alignItems: "center",
            marginTop: 10,
            marginBottom: 40,
        },
        image: {
            width: 96,
            height: 96,
            borderRadius: 48,
        },
        linkText: {
            color: colors.link,
            fontWeight: "500",
            fontSize: 14,
            marginTop: 16,
            letterSpacing: 0.3,
        },
        section: {
            marginBottom: 32,
        },
        label: {
            fontSize: 11,
            fontWeight: "700",
            color: colors.textSecondary,
            letterSpacing: 1.2,
            marginBottom: 8,
        },
        input: {
            color: colors.textPrimary,
            fontSize: 18,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            minHeight: 40,
        },
        spacer: {
            height: 24,
        },
        row: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingVertical: 20,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        lastRow: {
            borderBottomWidth: 0,
        },
        rowText: {
            fontSize: 16,
            color: colors.textPrimary,
            fontWeight: "400",
        },
        linkTextMain: {
            fontSize: 16,
            color: colors.textPrimary,
            fontWeight: "400",
        },
        dangerText: {
            fontSize: 16,
            color: colors.danger,
            fontWeight: "400",
        },
    });
};