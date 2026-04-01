import React, { useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import {
    BottomSheetModal,
    BottomSheetView,
    BottomSheetBackdrop,
    BottomSheetBackdropProps
} from '@gorhom/bottom-sheet';
import { LogOut, X } from 'lucide-react-native';

interface Props {
    isVisible: boolean;
    onClose: () => void;
    onConfirm: () => void;
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

const LogoutConfirmationSheet = ({ isVisible, onClose, onConfirm }: Props) => {
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
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

    const handleConfirm = () => {
        onConfirm();
        onClose();
    };

    return (
        <BottomSheetModal
            ref={bottomSheetModalRef}
            snapPoints={['35%']} 
            onChange={handleSheetChanges}
            backdropComponent={renderBackdrop}
            backgroundStyle={styles.bottomSheetBackground}
            handleIndicatorStyle={styles.handleIndicator}
            enablePanDownToClose={true}
        >
            <BottomSheetView style={styles.contentContainer}>
                <Text style={styles.title}>Sign Out</Text>
                <Text style={styles.subtitle}>Are you sure you want to log out of your account?</Text>
                
                <TouchableOpacity style={styles.row} onPress={handleConfirm}>
                    <View style={styles.rowLeft}>
                        <LogOut size={24} color={colors.danger} strokeWidth={1.5} />
                        <Text style={styles.dangerText}>Yes, Log Out</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.row, styles.lastRow]} onPress={onClose}>
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

export default LogoutConfirmationSheet;