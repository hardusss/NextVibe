import React, { useState, useEffect, useRef } from "react";
import {
    ScrollView, View, Text, StatusBar, StyleSheet, useColorScheme,
    Animated, TouchableWithoutFeedback, TouchableOpacity, TextInput, RefreshControl, Platform, ActivityIndicator
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
    ArrowLeft, Palette, Mail, Sparkles, Moon, Droplets, Radar,
    ShieldCheck, KeyRound, LogOut, ChevronRight, Trash2
} from "lucide-react-native";
import getUserDetail from "@/src/api/user.detail";
import linkEmail from "@/src/api/link.email";
import verifySeeker from "@/src/api/verify.seeker";
import { Switch } from "react-native-paper";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { storage } from '@/src/utils/storage';
import { useFocusEffect } from "expo-router";
import { useCallback } from 'react';
import AvatarSheet from "./AvatarSheet";
import LogoutConfirmationSheet from "./LogoutConfirmationSheet";
import DeleteAccountSheet from "./DeleteAccountSheet";
import ResetPasswordSheet from "./ResetPasswordSheet";
import deleteAccount from "@/src/api/delete.account";
import { ChatWallpaperModal } from "./ChatWallpaperModal";
import resetAvatar from "@/src/api/reset.avatar";
import { PopupProvider, usePopup } from "../Popup";
import updateUser from "@/src/api/update.user";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { configureGoogleSignin } from "@/src/config/googleSignin";
import ConfirmDialog from "../Shared/Toasts/ConfirmDialog";
import Web3Toast from "../Shared/Toasts/Web3Toast";
import validationUsername from "@/src/validation/username-update-validator";
import { clearFeedCache } from "../Home/MainPage";
import { clearProfileCache } from "../ProfilePage/ProfilePage";
import { requestScanStart, requestScanStop } from "@/src/utils/bleScanController";
import haptics from "@/src/utils/haptics";

import useWalletAddress from "@/hooks/useWalletAddress";
import GaslessIndicator from "@/components/Shared/GaslessIndicator";
import { useSettingsStore, type ThemePreference } from "@/src/stores/settingsStore";

interface User {
    username: string;
    about: string;
    avatar: string | null;
    email?: string | null;
    wallet_address?: string | null;
    post_count: number;
    readers_count: number;
    follows_count: number;
    official: boolean;
    seeker_verified: boolean;
}

const darkColors = {
    background: "#0A0410",
    card: "rgba(255,255,255,0.04)",
    cardBorder: "rgba(168,85,247,0.14)",
    fieldBackground: "rgba(255,255,255,0.05)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(255,255,255,0.55)",
    border: "rgba(255,255,255,0.08)",
    accent: "#a855f7",
    accentSoft: "rgba(168,85,247,0.15)",
    link: "#a78bfa",
    danger: "#f87171",
    dangerSoft: "rgba(248,113,113,0.12)",
    saveActive: "#a855f7",
    saveInactive: "rgba(255,255,255,0.08)"
};

const lightColors = {
    background: "#ffffff",
    card: "#F7F5FB",
    cardBorder: "rgba(124,58,237,0.10)",
    fieldBackground: "#ffffff",
    textPrimary: "#1A1225",
    textSecondary: "#64748B",
    border: "rgba(0,0,0,0.07)",
    accent: "#7C3AED",
    accentSoft: "rgba(124,58,237,0.10)",
    link: "#7C3AED",
    danger: "#EF4444",
    dangerSoft: "rgba(239,68,68,0.10)",
    saveActive: "#7C3AED",
    saveInactive: "rgba(0,0,0,0.06)"
};

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
];

function PageSettingsContent() {
    const [isVisibleAvatar, setIsVisableAvatar] = useState<boolean>(false);
    const [isVisibleLogoutConfirmation, setIsVisibleLogoutConfirmation] = useState<boolean>(false);
    const [isVisibleDeleteConfirmation, setIsVisibleDeleteConfirmation] = useState<boolean>(false);
    const [isVisibleResetPassword, setIsVisibleResetPassword] = useState<boolean>(false);
    const [isWallpaperModalVisible, setIsWallpaperModalVisible] = useState<boolean>(false);
    const [user, setUser] = useState<User | null>(null);
    const [username, setUsername] = useState("");
    const [about, setAbout] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const [isSave, setIsSave] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);
    const [showConfirm, setShowConfirm] = useState(false);
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [toastSuccess, setToastSuccess] = useState(true);
    const [isBluetoothEnabled, setIsBluetoothEnabled] = useState<boolean>(true);
    const [newEmail, setNewEmail] = useState("");
    const [isLinkingEmail, setIsLinkingEmail] = useState(false);
    const [isVerifyingSeeker, setIsVerifyingSeeker] = useState(false);
    const themePreference = useSettingsStore((state) => state.themePreference);
    const liquidGlassEnabled = useSettingsStore((state) => state.liquidGlassEnabled);
    const setThemePreference = useSettingsStore((state) => state.setThemePreference);
    const setLiquidGlassEnabled = useSettingsStore((state) => state.setLiquidGlassEnabled);
    const { address, disconnect } = useWalletAddress();

    const handleLinkEmail = async () => {
        if (!newEmail || !newEmail.trim()) {
            showToast("Please enter a valid email address", false);
            return;
        }
        setIsLinkingEmail(true);
        try {
            const res = await linkEmail(newEmail.trim());
            showToast(res.message || "Email linked successfully! +20 Rep 🎉", true);
            showPopup('success', 'Email Linked', 'You earned +20 Reputation points!');
            setNewEmail("");
            await fetchUserData();
        } catch (err: any) {
            const errMsg = err?.response?.data?.error || "Failed to link email";
            showToast(errMsg, false);
        } finally {
            setIsLinkingEmail(false);
        }
    };

    const handleVerifySeeker = async () => {
        if (isVerifyingSeeker) return;
        setIsVerifyingSeeker(true);
        try {
            const result = await verifySeeker();
            if (result.seekerVerified) {
                setUser((prev) => (prev ? { ...prev, seeker_verified: true } : prev));
                showToast("You're Seeker Verified", true);
            } else if (result.error === "SGT_ALREADY_USED") {
                showToast("This Genesis Token is already linked to another NextVibe account.", false);
            } else if (result.error === "SGT_NOT_FOUND") {
                showToast("No Seeker Genesis Token found in this wallet.", false);
            } else {
                showToast("Verification failed. Try again later.", false);
            }
        } finally {
            setIsVerifyingSeeker(false);
        }
    };

    const router = useRouter();
    const isDark = useColorScheme() === "dark";
    const insets = useSafeAreaInsets();
    const colors = isDark ? darkColors : lightColors;
    const styles = getStyles(colors, insets);
    const { showPopup } = usePopup();

    const scaleAnim = useRef(new Animated.Value(1)).current;

    // Load initial Bluetooth scan setting
    useEffect(() => {
        const loadBluetoothSetting = async () => {
            try {
                const value = await AsyncStorage.getItem("bluetooth_scan_enabled");
                if (value === "false") {
                    setIsBluetoothEnabled(false);
                } else {
                    setIsBluetoothEnabled(true);
                }
            } catch (e) {
                console.warn("Failed to load Bluetooth setting:", e);
            }
        };
        loadBluetoothSetting();
    }, []);

    const handleToggleBluetooth = async (newValue: boolean) => {
        haptics.selection();
        setIsBluetoothEnabled(newValue);
        try {
            await AsyncStorage.setItem("bluetooth_scan_enabled", newValue ? "true" : "false");
            if (Platform.OS === 'ios' || Platform.OS === 'android') {
                if (newValue) {
                    await requestScanStart();
                } else {
                    requestScanStop();
                }
            }
        } catch (e) {
            console.warn("Failed to save Bluetooth setting:", e);
        }
    };
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        configureGoogleSignin();
    }, []);

    const handleLogoutConfirm = async () => {
        storage.clearAll();
        AsyncStorage.clear();
        GoogleSignin.signOut();
        setIsVisibleLogoutConfirmation(false);
        clearFeedCache();
        clearProfileCache();
        if (address) {
            await disconnect();
        }
        router.replace("/register");
    }

    const handleLogout = () => {
        setIsVisibleLogoutConfirmation(true);
    }

    const handleDeleteAccountConfirm = async () => {
        try {
            await deleteAccount();
        } catch (e) {
            setIsVisibleDeleteConfirmation(false);
            haptics.notification('error');
            showToast("Couldn't delete your account. Please try again.", false);
            return;
        }
        setIsVisibleDeleteConfirmation(false);
        // Same local cleanup as logout — the account no longer exists server-side
        storage.clearAll();
        AsyncStorage.clear();
        GoogleSignin.signOut();
        clearFeedCache();
        clearProfileCache();
        if (address) {
            await disconnect();
        }
        router.replace("/register");
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
        <View style={[styles.image, { backgroundColor: colors.card }]} />
    );

    const SkeletonText = ({ width, height = 14 }: {width: number | string, height?: number}) => (
        <View
            style={{
                width: width  as number,
                height: height,
                backgroundColor: colors.card,
                borderRadius: 4,
                marginVertical: 4
            }}
        />
    );

    const IconChip = ({ tint, children }: { tint: string; children: React.ReactNode }) => (
        <View style={[styles.iconChip, { backgroundColor: tint }]}>{children}</View>
    );

    const RowDivider = () => <View style={styles.rowDivider} />;

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
                <TouchableOpacity style={styles.backChip} onPress={handleBackPress} activeOpacity={0.8}>
                    <ArrowLeft size={22} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Settings</Text>
                <TouchableOpacity
                    disabled={!isSave}
                    onPress={handleSave}
                    activeOpacity={0.85}
                    style={[styles.savePill, isSave ? styles.savePillActive : styles.savePillInactive]}
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

                        <View style={styles.card}>
                            <View style={styles.fieldBlock}>
                                <SkeletonText width={70} height={12} />
                                <View style={{marginTop: 8}}><SkeletonText width="100%" height={24} /></View>
                            </View>
                            <RowDivider />
                            <View style={styles.fieldBlock}>
                                <SkeletonText width={50} height={12} />
                                <View style={{marginTop: 8}}><SkeletonText width="100%" height={40} /></View>
                            </View>
                        </View>
                    </>
                ) : (
                    <>
                        <View style={styles.centeredView}>
                            <TouchableWithoutFeedback onPressIn={() => {handlePressIn(); handleOpenEdit()}} onPressOut={handlePressOut}>
                                <Animated.View style={[styles.avatarRing, { transform: [{ scale: scaleAnim }] }]}>
                                    <Animated.Image
                                        style={styles.image}
                                        source={{ uri: `${user?.avatar}` }}
                                    />
                                </Animated.View>
                            </TouchableWithoutFeedback>
                            <TouchableOpacity style={styles.changePhotoPill} onPress={handleOpenEdit} activeOpacity={0.8}>
                                <Text style={styles.linkText}>Change Photo</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.sectionHeader}>PROFILE</Text>
                        <View style={styles.card}>
                            <View style={styles.fieldBlock}>
                                <Text style={styles.label}>USERNAME</Text>
                                <TextInput
                                    style={styles.input}
                                    value={username}
                                    onChangeText={setUsername}
                                    placeholderTextColor={colors.textSecondary}
                                    selectionColor={colors.accent}
                                />
                            </View>
                            <RowDivider />
                            <View style={styles.fieldBlock}>
                                <Text style={styles.label}>ABOUT</Text>
                                <TextInput
                                    style={[styles.input, { minHeight: 40, paddingTop: 0 }]}
                                    value={about}
                                    onChangeText={setAbout}
                                    multiline
                                    placeholder="Tell people about yourself"
                                    placeholderTextColor={colors.textSecondary}
                                    selectionColor={colors.accent}
                                />
                            </View>
                        </View>

                        <Text style={styles.sectionHeader}>APPEARANCE</Text>
                        <View style={styles.card}>
                            <View style={styles.row}>
                                <IconChip tint={colors.accentSoft}>
                                    <Moon size={18} color={colors.accent} />
                                </IconChip>
                                <View style={styles.rowBody}>
                                    <Text style={styles.rowText}>Theme</Text>
                                </View>
                                <View style={styles.themePicker}>
                                    {THEME_OPTIONS.map((option) => {
                                        const isSelected = themePreference === option.value;
                                        return (
                                            <TouchableOpacity
                                                key={option.value}
                                                style={[
                                                    styles.themeOption,
                                                    isSelected && styles.themeOptionSelected,
                                                ]}
                                                onPress={() => {
                                                    haptics.selection();
                                                    setThemePreference(option.value);
                                                }}
                                                activeOpacity={0.7}
                                            >
                                                <Text
                                                    style={[
                                                        styles.themeOptionText,
                                                        isSelected && styles.themeOptionTextSelected,
                                                    ]}
                                                >
                                                    {option.label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                            <RowDivider />
                            <TouchableOpacity
                                style={styles.row}
                                onPress={() => {
                                    haptics.impact('light');
                                    setIsWallpaperModalVisible(true);
                                }}
                                activeOpacity={0.7}
                            >
                                <IconChip tint={colors.accentSoft}>
                                    <Palette size={18} color={colors.accent} />
                                </IconChip>
                                <View style={styles.rowBody}>
                                    <Text style={styles.rowText}>Chat Wallpaper & Theme</Text>
                                    <Text style={styles.rowDescription}>
                                        Backgrounds, gradients, dimming, and bubble styles
                                    </Text>
                                </View>
                                <ChevronRight size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                            {Platform.OS === 'ios' && (
                                <>
                                    <RowDivider />
                                    <View style={styles.row}>
                                        <IconChip tint={colors.accentSoft}>
                                            <Droplets size={18} color={colors.accent} />
                                        </IconChip>
                                        <View style={styles.rowBody}>
                                            <Text style={styles.rowText}>Liquid Glass</Text>
                                            <Text style={styles.rowDescription}>
                                                Use the native iOS liquid glass visual effect
                                            </Text>
                                        </View>
                                        <Switch
                                            value={liquidGlassEnabled}
                                            onValueChange={(value) => {
                                                haptics.selection();
                                                setLiquidGlassEnabled(value);
                                            }}
                                            color={colors.accent}
                                        />
                                    </View>
                                </>
                            )}
                        </View>

                        <Text style={styles.sectionHeader}>GASLESS TRANSACTIONS</Text>
                        <GaslessIndicator />

                        {(address || user?.wallet_address) && (
                            <>
                                <Text style={styles.sectionHeader}>WALLET</Text>
                                <View style={styles.card}>
                                    {user?.seeker_verified ? (
                                        <View style={styles.row}>
                                            <IconChip tint={isDark ? 'rgba(74,222,128,0.12)' : 'rgba(16,185,129,0.10)'}>
                                                <ShieldCheck size={18} color={isDark ? '#4ade80' : '#059669'} />
                                            </IconChip>
                                            <View style={styles.rowBody}>
                                                <Text style={styles.rowText}>Seeker Verified</Text>
                                                <Text style={styles.rowDescription}>
                                                    Genesis Token detected on-chain
                                                </Text>
                                            </View>
                                        </View>
                                    ) : (
                                        <TouchableOpacity
                                            style={styles.row}
                                            onPress={handleVerifySeeker}
                                            disabled={isVerifyingSeeker}
                                            activeOpacity={0.7}
                                        >
                                            <IconChip tint={colors.accentSoft}>
                                                <ShieldCheck size={18} color={colors.accent} />
                                            </IconChip>
                                            <View style={styles.rowBody}>
                                                <Text style={styles.rowText}>Verify Seeker</Text>
                                                <Text style={styles.rowDescription}>
                                                    Check your wallet for a Seeker Genesis Token
                                                </Text>
                                            </View>
                                            {isVerifyingSeeker ? (
                                                <ActivityIndicator size="small" color={colors.accent} />
                                            ) : (
                                                <ChevronRight size={18} color={colors.textSecondary} />
                                            )}
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </>
                        )}

                        <Text style={styles.sectionHeader}>DISCOVERY</Text>
                        <View style={styles.card}>
                            <View style={styles.row}>
                                <IconChip tint={colors.accentSoft}>
                                    <Radar size={18} color={colors.accent} />
                                </IconChip>
                                <View style={styles.rowBody}>
                                    <Text style={styles.rowText}>Background Scanning</Text>
                                    <Text style={styles.rowDescription}>
                                        Scan for nearby devices to receive vibes in the background
                                    </Text>
                                </View>
                                <Switch
                                    value={isBluetoothEnabled}
                                    onValueChange={handleToggleBluetooth}
                                    color={colors.accent}
                                />
                            </View>
                        </View>

                        {!user?.email ? (
                            <>
                                <View style={styles.sectionHeaderRow}>
                                    <Text style={[styles.sectionHeader, { marginTop: 0, marginBottom: 0 }]}>LINK EMAIL</Text>
                                    <View style={styles.repBadge}>
                                        <Sparkles size={12} color={colors.accent} style={{ marginRight: 4 }} />
                                        <Text style={styles.repBadgeText}>+20 REP</Text>
                                    </View>
                                </View>

                                <View style={[styles.card, styles.linkEmailCard]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                        <IconChip tint={colors.accentSoft}>
                                            <Mail size={18} color={colors.accent} />
                                        </IconChip>
                                        <Text style={styles.linkEmailTitle}>Link Email Address</Text>
                                    </View>
                                    <Text style={styles.linkEmailDesc}>
                                        Add your email address to secure your account and claim +20 Reputation points.
                                    </Text>
                                    <View style={styles.linkEmailInputRow}>
                                        <TextInput
                                            style={styles.linkEmailInput}
                                            placeholder="Enter email address"
                                            placeholderTextColor={colors.textSecondary}
                                            value={newEmail}
                                            onChangeText={setNewEmail}
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            selectionColor={colors.accent}
                                        />
                                        <TouchableOpacity
                                            style={[styles.linkEmailBtn, isLinkingEmail && { opacity: 0.7 }]}
                                            onPress={handleLinkEmail}
                                            disabled={isLinkingEmail}
                                            activeOpacity={0.8}
                                        >
                                            {isLinkingEmail ? (
                                                <ActivityIndicator size="small" color="#ffffff" />
                                            ) : (
                                                <Text style={styles.linkEmailBtnText}>Link (+20 Rep)</Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </>
                        ) : (
                            <>
                                <Text style={styles.sectionHeader}>LINKED EMAIL</Text>
                                <View style={styles.card}>
                                    <View style={styles.row}>
                                        <IconChip tint={colors.accentSoft}>
                                            <Mail size={18} color={colors.accent} />
                                        </IconChip>
                                        <View style={styles.rowBody}>
                                            <Text style={styles.rowText}>{user.email}</Text>
                                            <Text style={styles.rowDescription}>Linked to your account</Text>
                                        </View>
                                    </View>
                                </View>
                            </>
                        )}

                        <Text style={styles.sectionHeader}>SECURITY & ACCOUNT</Text>
                        <View style={styles.card}>
                            <TouchableOpacity
                                style={styles.row}
                                onPress={() => {
                                    haptics.impact('light');
                                    setIsVisibleResetPassword(true);
                                }}
                                activeOpacity={0.7}
                            >
                                <IconChip tint={colors.accentSoft}>
                                    <KeyRound size={18} color={colors.accent} />
                                </IconChip>
                                <View style={styles.rowBody}>
                                    <Text style={styles.rowText}>Reset Password</Text>
                                </View>
                                <ChevronRight size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                            <RowDivider />
                            <TouchableOpacity
                                style={styles.row}
                                onPress={handleLogout}
                                activeOpacity={0.7}
                            >
                                <IconChip tint={colors.dangerSoft}>
                                    <LogOut size={18} color={colors.danger} />
                                </IconChip>
                                <View style={styles.rowBody}>
                                    <Text style={styles.dangerText}>Sign Out</Text>
                                </View>
                            </TouchableOpacity>
                            <RowDivider />
                            <TouchableOpacity
                                style={styles.row}
                                onPress={() => {
                                    haptics.impact('light');
                                    setIsVisibleDeleteConfirmation(true);
                                }}
                                activeOpacity={0.7}
                            >
                                <IconChip tint={colors.dangerSoft}>
                                    <Trash2 size={18} color={colors.danger} />
                                </IconChip>
                                <View style={styles.rowBody}>
                                    <Text style={styles.dangerText}>Delete Account</Text>
                                    <Text style={styles.rowDescription}>Permanently remove your profile and data</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </ScrollView>

            <AvatarSheet isVisible={isVisibleAvatar} onClose={() => setIsVisableAvatar((prev)=>!prev)} onReset={() => resetAvatar()} />
            <LogoutConfirmationSheet
                isVisible={isVisibleLogoutConfirmation}
                onClose={() => {setIsVisibleLogoutConfirmation(false)}}
                onConfirm={handleLogoutConfirm}
            />
            <DeleteAccountSheet
                isVisible={isVisibleDeleteConfirmation}
                onClose={() => setIsVisibleDeleteConfirmation(false)}
                onConfirm={handleDeleteAccountConfirm}
            />
            <ResetPasswordSheet
                isVisible={isVisibleResetPassword}
                onClose={() => setIsVisibleResetPassword(false)}
                onSuccess={() => {
                    showPopup('success', 'Success', 'Your password has been successfully changed');
                    setIsVisibleResetPassword(false);
                }}
            />
            <ChatWallpaperModal
                visible={isWallpaperModalVisible}
                onClose={() => setIsWallpaperModalVisible(false)}
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

const getStyles = (colors: any, insets: any) => {
    return StyleSheet.create({
        container: {
            backgroundColor: colors.background,
            flex: 1,
        },
        header: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingTop: insets.top + 8,
            paddingBottom: 12,
            backgroundColor: colors.background,
        },
        backChip: {
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.card,
        },
        title: {
            fontSize: 18,
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
            color: colors.textPrimary,
            letterSpacing: 0.3,
        },
        savePill: {
            minWidth: 64,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 14,
        },
        savePillActive: {
            backgroundColor: colors.saveActive,
        },
        savePillInactive: {
            backgroundColor: colors.saveInactive,
        },
        saveText: {
            fontSize: 14,
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
        },
        saveTextActive: {
            color: "#ffffff",
        },
        saveTextInactive: {
            color: colors.textSecondary,
        },
        contentContainer: {
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: insets.bottom + 60,
        },
        centeredView: {
            alignItems: "center",
            marginTop: 8,
            marginBottom: 24,
        },
        avatarRing: {
            padding: 3,
            borderRadius: 54,
            borderWidth: 2,
            borderColor: colors.accentSoft,
        },
        image: {
            width: 96,
            height: 96,
            borderRadius: 48,
        },
        changePhotoPill: {
            marginTop: 12,
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: colors.accentSoft,
        },
        linkText: {
            color: colors.link,
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
            fontSize: 13,
            letterSpacing: 0.3,
        },
        sectionHeader: {
            fontSize: 11,
            fontWeight: "700",
            color: colors.textSecondary,
            letterSpacing: 1.2,
            marginTop: 24,
            marginBottom: 8,
            marginLeft: 4,
        },
        sectionHeaderRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 24,
            marginBottom: 8,
            paddingLeft: 4,
        },
        card: {
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            borderRadius: 20,
            paddingHorizontal: 16,
            overflow: "hidden",
        },
        fieldBlock: {
            paddingVertical: 14,
        },
        label: {
            fontSize: 11,
            fontWeight: "700",
            color: colors.textSecondary,
            letterSpacing: 1.2,
            marginBottom: 6,
        },
        input: {
            color: colors.textPrimary,
            fontSize: 16,
            paddingVertical: 4,
            includeFontPadding: false,
        },
        row: {
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 14,
            minHeight: 56,
        },
        rowBody: {
            flex: 1,
            paddingRight: 12,
        },
        rowDivider: {
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.border,
            marginLeft: 48,
        },
        iconChip: {
            width: 36,
            height: 36,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
        },
        rowText: {
            fontSize: 15,
            color: colors.textPrimary,
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
        },
        rowDescription: {
            fontSize: 12,
            color: colors.textSecondary,
            marginTop: 3,
            lineHeight: 16,
        },
        dangerText: {
            fontSize: 15,
            color: colors.danger,
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
        },
        themePicker: {
            flexDirection: 'row',
            borderRadius: 12,
            backgroundColor: colors.saveInactive,
            padding: 3,
        },
        themeOption: {
            paddingVertical: 7,
            paddingHorizontal: 12,
            alignItems: 'center',
            borderRadius: 9,
        },
        themeOptionSelected: {
            backgroundColor: colors.accent,
        },
        themeOptionText: {
            fontSize: 12,
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
            color: colors.textSecondary,
        },
        themeOptionTextSelected: {
            color: '#FFFFFF',
        },
        repBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.accentSoft,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
        },
        repBadgeText: {
            color: colors.accent,
            fontSize: 11,
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
        },
        linkEmailCard: {
            paddingVertical: 16,
        },
        linkEmailTitle: {
            fontSize: 15,
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
            color: colors.textPrimary,
        },
        linkEmailDesc: {
            fontSize: 13,
            color: colors.textSecondary,
            marginBottom: 12,
            lineHeight: 18,
        },
        linkEmailInputRow: {
            flexDirection: 'row',
            gap: 8,
            alignItems: 'center',
        },
        linkEmailInput: {
            flex: 1,
            height: 44,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            borderRadius: 12,
            paddingHorizontal: 12,
            fontSize: 14,
            color: colors.textPrimary,
            backgroundColor: colors.fieldBackground,
        },
        linkEmailBtn: {
            backgroundColor: colors.accent,
            paddingHorizontal: 14,
            height: 44,
            borderRadius: 12,
            justifyContent: 'center',
            alignItems: 'center',
        },
        linkEmailBtnText: {
            color: '#ffffff',
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
            fontSize: 13,
        },
    });
};
