import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
    useColorScheme, StyleSheet, Text,
    TouchableOpacity, View, Pressable, Vibration, ActivityIndicator, Modal
} from 'react-native';
import {
    BottomSheetModal,
    BottomSheetView,
    useBottomSheet,
    BottomSheetBackdropProps
} from '@gorhom/bottom-sheet';
import { Users, Copy, CheckCircle2, Gift, Map, Crown } from "lucide-react-native";
import Animated, {
    interpolate, Extrapolation, useAnimatedStyle
} from 'react-native-reanimated';
import { BlurView } from '@react-native-community/blur';
import Web3Toast from '@/components/Shared/Toasts/Web3Toast';
import * as Clipboard from 'expo-clipboard';
import getInviteInfo from "@/src/api/get.invite.info";
import mintOgNFT from '@/src/api/mint.og';

export interface InviteSheetRef {
    present: () => void;
    dismiss: () => void;
}

type ClaimState = 'idle' | 'loading' | 'claimed';

/**
 * Custom backdrop leveraging reanimated for smooth opacity transitions.
 */
export const CustomBackdrop = ({ animatedIndex, style }: BottomSheetBackdropProps) => {
    const isDark = useColorScheme() === 'dark';
    const { close } = useBottomSheet();

    /**
     * Interpolates backdrop opacity based on the bottom sheet's animated index.
     * Extrapolation.CLAMP is strictly required to prevent the opacity value from exceeding 1.0
     * or dropping below 0.0 during overscroll gestures or high-velocity dismissals.
     */
    const animatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(animatedIndex.value, [-1, 0], [0, 1], Extrapolation.CLAMP),
    }));

    return (
        <Animated.View style={[StyleSheet.absoluteFill, style, animatedStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => close()}>
                <BlurView style={StyleSheet.absoluteFill} blurType={isDark ? "dark" : "light"} blurAmount={2} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.2)' }]} />
            </Pressable>
        </Animated.View>
    );
};

const MILESTONES = [
    { target: 1, title: "Basic Frame", desc: "Base profile frame reward", Icon: Gift },
    { target: 5, title: "VibeMap + Elite Frame", desc: "Unlock map & cooler frame", Icon: Map },
    { target: 10, title: "OG cNFT + Mythic Frame", desc: "Max supply 25! Ultimate reward", Icon: Crown },
];

export const InviteBottomSheet = forwardRef<InviteSheetRef>((_, ref) => {
    const isDark = useColorScheme() === 'dark';
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);

    const [inviteCode, setInviteCode] = useState<string>('------');
    const [invitedCount, setInvitedCount] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);

    /**
     * Tracks the OG cNFT claim lifecycle.
     * - idle    : button is pressable, shows Crown icon
     * - loading : mint tx in flight, shows ActivityIndicator, button disabled
     * - claimed : mint succeeded, button locked permanently with green check
     */
    const [claimState, setClaimState] = useState<ClaimState>('idle');

    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastIsSuccess, setToastIsSuccess] = useState(true);

    const showToast = (message: string, isSuccess: boolean) => {
        setToastMessage(message); setToastIsSuccess(isSuccess); setToastVisible(true);
    };

    const fetchInviteData = async () => {
        setIsLoading(true);
        try {
            const response = await getInviteInfo();
            if (response.og_avatar == true){
                setClaimState("claimed");
            };

            setInviteCode(response?.invite_code || 'SEEKER');
            setInvitedCount(response?.invited_count || 0);
        } catch (error) {
            console.error("Failed to fetch invite info:", error);
            showToast("Failed to load invite info", false);
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Exposing imperative methods to the parent via forwardRef.
     * Network requests are intentionally deferred until present() is invoked
     * to avoid redundant API calls if the component mounts but remains unopened.
     */
    useImperativeHandle(ref, () => ({
        present: () => {
            bottomSheetModalRef.current?.present();
            fetchInviteData();
        },
        dismiss: () => {
            bottomSheetModalRef.current?.dismiss();
        },
    }));

    const copyToClipboard = async () => {
        if (inviteCode === '------') return;
        await Clipboard.setStringAsync(inviteCode);
        Vibration.vibrate(50);
        showToast("Invite code copied!", true);
    };

    /**
     * Initiates the OG cNFT mint flow.
     * Guard on claimState prevents duplicate submissions — once loading or claimed,
     * the handler returns early and the button is also marked disabled at the UI level.
     * On error the state resets to idle so the user can retry.
     */
    const handleClaimOgNFT = async () => {
        if (claimState !== 'idle') return;

        setClaimState('loading');
        Vibration.vibrate(20);

        try {
            await mintOgNFT();
            setClaimState('claimed');
            Vibration.vibrate([0, 40, 60, 80]);
            showToast("OG cNFT successfully minted!", true);
        } catch (error) {
            setClaimState('idle');
            showToast("Mint failed. Try again.", false);
        }
    };

    const bg = isDark ? '#0f021c' : '#ffffff';
    const mainColor = isDark ? '#ffffff' : '#1f2937';
    const mutedColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.32)';
    const borderColor = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';
    const inputBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
    const iconColor = isDark ? 'rgba(196,167,255,0.9)' : 'rgba(109,40,217,0.85)';
    const handleColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
    const tokenActiveBg = isDark ? 'rgba(167,139,250,0.14)' : 'rgba(109,40,217,0.08)';
    const tokenActiveBorder = isDark ? 'rgba(196,167,255,0.4)' : 'rgba(109,40,217,0.3)';
    const accentText = isDark ? '#d8b4fe' : '#7c3aed';

    // Clamping the maximum progress value to 100 ensures the animated fill width doesn't overflow the container bounds if invitedCount exceeds the max milestone.
    const progressPercentage = Math.min((invitedCount / 10) * 100, 100);

    const claimIsDisabled = claimState !== 'idle';

    const claimBg = claimState === 'claimed'
        ? (isDark ? 'rgba(52,211,153,0.14)' : 'rgba(16,185,129,0.08)')
        : tokenActiveBg;

    const claimBorder = claimState === 'claimed'
        ? (isDark ? 'rgba(52,211,153,0.4)' : 'rgba(16,185,129,0.3)')
        : tokenActiveBorder;

    const claimColor = claimState === 'claimed'
        ? (isDark ? '#6ee7b7' : '#059669')
        : accentText;

    return (
        <>
            <Modal visible={toastVisible} transparent animationType="none">
                <View style={styles.toastOverlay} pointerEvents="box-none">
                    <Web3Toast
                        visible={toastVisible}
                        message={toastMessage}
                        isSuccess={toastIsSuccess}
                        onHide={() => setToastVisible(false)}
                    />
                </View>
            </Modal>

            <BottomSheetModal
                ref={bottomSheetModalRef}
                snapPoints={['75%']}
                index={0}
                backdropComponent={CustomBackdrop}
                backgroundStyle={{ backgroundColor: bg }}
                handleIndicatorStyle={{ backgroundColor: handleColor, width: 36 }}
            >
                <BottomSheetView style={[styles.container, { backgroundColor: bg }]}>
                    <View style={styles.header}>
                        <Users size={18} color={iconColor} strokeWidth={1.5} />
                        <Text style={[styles.headerTitle, { color: mainColor }]}>Invite Friends</Text>
                    </View>

                    {isLoading ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator color={accentText} />
                        </View>
                    ) : (
                        <>
                            <Text style={[styles.sectionLabel, { color: mutedColor }]}>YOUR INVITE CODE</Text>
                            <TouchableOpacity
                                style={styles.inputWrap}
                                onPress={copyToClipboard}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.inviteCodeText, { color: mainColor }]}>
                                    {inviteCode}
                                </Text>
                                <View style={[styles.copyBadge, { backgroundColor: inputBg, borderColor: borderColor }]}>
                                    <Copy size={14} color={mutedColor} />
                                </View>
                            </TouchableOpacity>

                            <View style={styles.progressHeader}>
                                <Text style={[styles.sectionLabel, { color: mutedColor, marginBottom: 0 }]}>INVITE PROGRESS</Text>
                                <Text style={[styles.countText, { color: accentText }]}>{invitedCount} / 10</Text>
                            </View>

                            <View style={[styles.progressBarContainer, { backgroundColor: inputBg }]}>
                                <Animated.View
                                    style={[
                                        styles.progressBarFill,
                                        { backgroundColor: accentText, width: `${progressPercentage}%` }
                                    ]}
                                />
                            </View>

                            <View style={styles.milestonesWrapper}>
                                {MILESTONES.map((milestone, index) => {
                                    const isUnlocked = invitedCount >= milestone.target;
                                    const MIcon = milestone.Icon;

                                    return (
                                        <View
                                            key={index}
                                            style={[
                                                styles.milestoneRow,
                                                {
                                                    backgroundColor: isUnlocked ? tokenActiveBg : inputBg,
                                                    borderColor: isUnlocked ? tokenActiveBorder : borderColor,
                                                }
                                            ]}
                                        >
                                            <View style={[
                                                styles.iconContainer,
                                                { backgroundColor: isUnlocked ? tokenActiveBorder : 'transparent' }
                                            ]}>
                                                <MIcon size={20} color={isUnlocked ? accentText : mutedColor} strokeWidth={1.5} />
                                            </View>

                                            <View style={styles.milestoneInfo}>
                                                <Text style={[styles.milestoneTitle, { color: isUnlocked ? accentText : mainColor }]}>
                                                    {milestone.title}
                                                </Text>
                                                <Text style={[styles.milestoneSub, { color: mutedColor }]}>
                                                    {milestone.desc}
                                                </Text>
                                            </View>

                                            <View style={styles.targetBadge}>
                                                {isUnlocked ? (
                                                    <CheckCircle2 size={20} color={accentText} strokeWidth={2} />
                                                ) : (
                                                    <Text style={[styles.targetText, { color: mutedColor }]}>
                                                        {milestone.target}
                                                    </Text>
                                                )}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>

                            {invitedCount >= 10 && (
                                <TouchableOpacity
                                    style={[
                                        styles.claimButton,
                                        { backgroundColor: claimBg, borderColor: claimBorder },
                                        claimIsDisabled && styles.claimButtonDisabled,
                                    ]}
                                    activeOpacity={claimIsDisabled ? 1 : 0.75}
                                    onPress={handleClaimOgNFT}
                                    disabled={claimIsDisabled}
                                >
                                    {claimState === 'loading' && (
                                        <>
                                            <ActivityIndicator size="small" color={accentText} />
                                            <Text style={[styles.claimButtonText, { color: accentText }]}>
                                                Minting...
                                            </Text>
                                        </>
                                    )}

                                    {claimState === 'claimed' && (
                                        <>
                                            <CheckCircle2 size={16} color={claimColor} strokeWidth={2} />
                                            <Text style={[styles.claimButtonText, { color: claimColor }]}>
                                                OG cNFT Claimed!
                                            </Text>
                                        </>
                                    )}

                                    {claimState === 'idle' && (
                                        <>
                                            <Crown size={16} color={claimColor} strokeWidth={1.5} />
                                            <Text style={[styles.claimButtonText, { color: claimColor }]}>
                                                Claim OG cNFT
                                            </Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            )}
                        </>
                    )}
                </BottomSheetView>
            </BottomSheetModal>
        </>
    );
});

InviteBottomSheet.displayName = 'InviteBottomSheet';

const styles = StyleSheet.create({
    toastOverlay: {
        flex: 1,
    },
    container: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 32,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 24,
    },
    headerTitle: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 18,
        includeFontPadding: false,
    },
    sectionLabel: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        letterSpacing: 2,
        marginBottom: 10,
        textAlign: 'center',
    },
    inputWrap: {
        alignItems: 'center',
        marginBottom: 32,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
    },
    inviteCodeText: {
        fontFamily: 'Dank Mono',
        fontSize: 48,
        letterSpacing: 4,
        includeFontPadding: false,
        paddingVertical: 8,
        textAlign: 'center',
    },
    copyBadge: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    countText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 14,
    },
    progressBarContainer: {
        height: 12,
        borderRadius: 6,
        width: '100%',
        overflow: 'hidden',
        marginBottom: 24,
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 6,
    },
    milestonesWrapper: {
        gap: 12,
    },
    milestoneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 16,
        borderWidth: 1,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    milestoneInfo: {
        flex: 1,
        gap: 4,
    },
    milestoneTitle: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 14,
        includeFontPadding: false,
    },
    milestoneSub: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        includeFontPadding: false,
    },
    targetBadge: {
        marginLeft: 8,
        minWidth: 32,
        alignItems: 'flex-end',
    },
    targetText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 16,
    },
    claimButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginTop: 20,
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    claimButtonDisabled: {
        opacity: 0.75,
    },
    claimButtonText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 15,
        includeFontPadding: false,
    },
});