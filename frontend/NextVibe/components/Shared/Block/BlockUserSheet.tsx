import React, { useRef, useEffect, useCallback, useState, PropsWithChildren } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme, ActivityIndicator, Platform } from 'react-native';
import {
    BottomSheetModal,
    BottomSheetView,
    BottomSheetBackdrop,
    BottomSheetBackdropProps
} from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ban, X } from 'lucide-react-native';

import { blockUser } from '@/src/api/block';
import { useBlockStore } from '@/src/stores/blockStore';
import haptics from '@/src/utils/haptics';

export interface BlockTarget {
    userId: number;
    username: string;
}

interface Props {
    /** Who to block; null keeps the sheet closed. */
    target: BlockTarget | null;
    onClose: () => void;
    /** Runs once the block is saved, after the sheet starts closing. */
    onBlocked?: (userId: number) => void;
}

const darkColors = {
    background: "#130822",
    textPrimary: "#ffffff",
    textSecondary: "#8b949e",
    border: "#2A1846",
    danger: "#ff4d4d",
    iconMain: "#c9d1d9"
};

const lightColors = {
    background: "#ffffff",
    textPrimary: "#000000",
    textSecondary: "#666666",
    border: "#e5e5e5",
    danger: "#ef4444",
    iconMain: "#666666"
};

// Post details opens as a native modal on iOS, which covers the root sheet
// host — a full-window overlay keeps the sheet on top of it.
const IOSOverlay = ({ children }: PropsWithChildren) => (
    <FullWindowOverlay>
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>{children}</GestureHandlerRootView>
    </FullWindowOverlay>
);

const BlockUserSheet = ({ target, onClose, onBlocked }: Props) => {
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    // Keeps the name on screen while the sheet animates closed
    const [shown, setShown] = useState<BlockTarget | null>(target);
    const setBlocked = useBlockStore((state) => state.setBlocked);
    const insets = useSafeAreaInsets();
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    const colors = isDarkMode ? darkColors : lightColors;
    const styles = getStyles(colors);

    useEffect(() => {
        if (target) {
            setShown(target);
            setFailed(false);
            bottomSheetModalRef.current?.present();
        } else {
            bottomSheetModalRef.current?.dismiss();
        }
    }, [target]);

    const handleSheetChanges = useCallback((index: number) => {
        if (index === -1) {
            onClose();
        }
    }, [onClose]);

    const renderBackdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={isDarkMode ? 0.7 : 0.4}
            />
        ),
        [isDarkMode]
    );

    const handleBlock = async () => {
        if (loading || !shown) return;
        setLoading(true);
        setFailed(false);
        try {
            await blockUser(shown.userId);
        } catch {
            haptics.notification('error');
            setFailed(true);
            return;
        } finally {
            setLoading(false);
        }
        haptics.notification('success');
        setBlocked(shown.userId, true);
        onClose();
        onBlocked?.(shown.userId);
    };

    return (
        <BottomSheetModal
            ref={bottomSheetModalRef}
            onChange={handleSheetChanges}
            backdropComponent={renderBackdrop}
            backgroundStyle={styles.bottomSheetBackground}
            handleIndicatorStyle={styles.handleIndicator}
            enablePanDownToClose={!loading}
            containerComponent={Platform.OS === 'ios' ? IOSOverlay : undefined}
        >
            <BottomSheetView style={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
                <Text style={styles.title}>Block @{shown?.username}?</Text>
                <Text style={styles.subtitle}>
                    They won't be able to message you or see your posts, and you won't see theirs. You can unblock them in Settings.
                </Text>

                {failed && (
                    <Text style={styles.errorText}>Couldn't block right now. Try again.</Text>
                )}

                <TouchableOpacity style={styles.row} onPress={handleBlock} disabled={loading}>
                    <View style={styles.rowLeft}>
                        {loading ? (
                            <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                            <Ban size={24} color={colors.danger} strokeWidth={1.5} />
                        )}
                        <Text style={styles.dangerText}>
                            {loading ? "Blocking…" : "Block"}
                        </Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.row, styles.lastRow]}
                    onPress={onClose}
                    disabled={loading}
                >
                    <View style={styles.rowLeft}>
                        <X size={24} color={colors.iconMain} strokeWidth={1.5} />
                        <Text style={styles.rowText}>Cancel</Text>
                    </View>
                </TouchableOpacity>
            </BottomSheetView>
        </BottomSheetModal>
    );
};

const getStyles = (colors: typeof darkColors) => StyleSheet.create({
    bottomSheetBackground: {
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    handleIndicator: {
        backgroundColor: colors.border,
        width: 40,
    },
    contentContainer: {
        paddingHorizontal: 24,
        paddingTop: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: "600",
        color: colors.textPrimary,
        letterSpacing: 0.5,
        marginBottom: 8,
        textAlign: "center"
    },
    subtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: "center",
        marginBottom: 24,
        fontWeight: "400",
        paddingHorizontal: 20,
    },
    errorText: {
        fontSize: 13,
        color: colors.danger,
        textAlign: "center",
        marginTop: -12,
        marginBottom: 12,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 18,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    lastRow: {
        borderBottomWidth: 0,
    },
    rowLeft: {
        flexDirection: "row",
        alignItems: "center",
    },
    rowText: {
        fontSize: 16,
        color: colors.textPrimary,
        fontWeight: "500",
        marginLeft: 12,
    },
    dangerText: {
        fontSize: 16,
        color: colors.danger,
        fontWeight: "600",
        marginLeft: 12,
    },
});

export default BlockUserSheet;
