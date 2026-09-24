import React, { useRef, useEffect, useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme, ActivityIndicator } from 'react-native';
import {
    BottomSheetModal,
    BottomSheetView,
    BottomSheetBackdrop,
    BottomSheetBackdropProps
} from '@gorhom/bottom-sheet';
import { Trash2, X } from 'lucide-react-native';

interface Props {
    isVisible: boolean;
    onClose: () => void;
    /** Runs the deletion; the sheet shows a spinner until it settles. */
    onConfirm: () => Promise<void>;
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

const DeleteAccountSheet = ({ isVisible, onClose, onConfirm }: Props) => {
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const [loading, setLoading] = useState(false);
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    const colors = isDarkMode ? darkColors : lightColors;
    const styles = getStyles(colors);

    useEffect(() => {
        if (isVisible) {
            bottomSheetModalRef.current?.present();
        } else {
            bottomSheetModalRef.current?.dismiss();
        }
    }, [isVisible]);

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

    const handleConfirm = async () => {
        if (loading) return;
        setLoading(true);
        try {
            await onConfirm();
        } finally {
            setLoading(false);
        }
    };

    return (
        <BottomSheetModal
            ref={bottomSheetModalRef}
            snapPoints={['40%']}
            onChange={handleSheetChanges}
            backdropComponent={renderBackdrop}
            backgroundStyle={styles.bottomSheetBackground}
            handleIndicatorStyle={styles.handleIndicator}
            enablePanDownToClose={!loading}
        >
            <BottomSheetView style={styles.contentContainer}>
                <Text style={styles.title}>Delete Account</Text>
                <Text style={styles.subtitle}>
                    This permanently removes your profile, personal details, and content from NextVibe. This can't be undone.
                    Collectibles already on Solana stay in your wallet; ones saved off-chain are removed.
                </Text>

                <TouchableOpacity style={styles.row} onPress={handleConfirm} disabled={loading}>
                    <View style={styles.rowLeft}>
                        {loading ? (
                            <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                            <Trash2 size={24} color={colors.danger} strokeWidth={1.5} />
                        )}
                        <Text style={styles.dangerText}>
                            {loading ? "Deleting…" : "Yes, Delete My Account"}
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

const getStyles = (colors: any) => StyleSheet.create({
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
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 24,
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

export default DeleteAccountSheet;
