import React, { useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { Text, StyleSheet, View, useColorScheme, TouchableOpacity, Dimensions } from 'react-native';
import {
    BottomSheetModal,
    BottomSheetView,
    BottomSheetBackdrop
} from '@gorhom/bottom-sheet';
import FastImage from 'react-native-fast-image';
import LottieView from 'lottie-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export interface ShareModalRef {
    present: () => void;
    dismiss: () => void;
}

export interface ShareModalProps {
    avatarUrl: string | null;
}

const darkColors = {
    background: '#0f021c',
    cardBg: 'rgba(255, 255, 255, 0.05)',
    textColor: '#ffffff',
    subText: '#a1a1aa',
    handleColor: '#ffffff',
    success: '#4ade80', 
    iconColor: '#d8b4fe' 
};

const lightColors = {
    background: '#ffffff',
    cardBg: 'rgba(0, 0, 0, 0.03)',
    textColor: '#1f2937',
    subText: '#6b7280',
    handleColor: '#e5e7eb',
    success: '#16a34a', 
    iconColor: '#7c3aed' 
};

const ShareModal = forwardRef<ShareModalRef, ShareModalProps>((props, ref) => {
    const theme = useColorScheme(); 
    const isDark = theme === 'dark';
    const colors = isDark ? darkColors : lightColors;

    const bottomSheetModalRef = useRef<BottomSheetModal>(null);

    const snapPoints = useMemo(() => ['50%', '65%'], []); 

    useImperativeHandle(ref, () => ({
        present: () => bottomSheetModalRef.current?.present(),
        dismiss: () => bottomSheetModalRef.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.6}
            />
        ),
        []
    );

    const handleClose = () => {
        bottomSheetModalRef.current?.dismiss();
    };

    return (
        <BottomSheetModal
            ref={bottomSheetModalRef}
            index={1}
            snapPoints={snapPoints}
            backdropComponent={renderBackdrop} 
            backgroundStyle={{ backgroundColor: colors.background }}
            handleIndicatorStyle={{ backgroundColor: colors.handleColor, width: 40, opacity: 0.5 }} 
        >
            <BottomSheetView style={[styles.contentContainer, { backgroundColor: colors.background }]}>

                <View style={styles.headerRow}>
                    <Text style={[styles.title, { color: colors.textColor }]}>NFC Share Active</Text>
                    <MaterialCommunityIcons name="broadcast" size={20} color={colors.success} style={{marginLeft: 8}} />
                </View>

                <View style={styles.avatarSection}>
                    <View style={styles.avatarWrapper}>
                        <LottieView 
                            autoPlay
                            loop
                            style={styles.lottie}
                            source={require('@/assets/lottie/pulse.json')}
                        />
                        
                        {props.avatarUrl && (
                            <FastImage 
                                source={{ uri: props.avatarUrl }} 
                                style={styles.avatar}
                                resizeMode={FastImage.resizeMode.cover}
                            />
                        )}
                    </View>
                </View>

                <View style={[styles.infoCard, { backgroundColor: colors.cardBg }]}>
                    <Text style={[styles.subtitle, { color: colors.subText }]}>
                        Keep tapping! Multiple friends can collect.
                    </Text>

                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                             <MaterialCommunityIcons name="account-group-outline" size={22} color={colors.iconColor} />
                             <Text style={[styles.statValue, { color: colors.success }]}>0</Text>
                             <Text style={[styles.statLabel, { color: colors.subText }]}>vibes shared</Text>
                        </View>
                    </View>
                </View>

                <View style={{flex: 1}} />

                {/* Кнопка DONE */}
                <TouchableOpacity 
                    onPress={handleClose}
                    activeOpacity={0.8}
                    style={styles.buttonContainer}
                >
                    <LinearGradient
                        colors={['#7c3aed', '#6d28d9']} 
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.gradientButton}
                    >
                        <Text style={styles.buttonText}>Done</Text>
                        <MaterialCommunityIcons name="check-circle-outline" size={20} color="white" style={{marginLeft: 8}}/>
                    </LinearGradient>
                </TouchableOpacity>

            </BottomSheetView>
        </BottomSheetModal>
    );
});

const styles = StyleSheet.create({
    contentContainer: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 10,
        paddingHorizontal: 24,
        paddingBottom: 24
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 22,
        fontFamily: "Dank Mono Bold", 
        includeFontPadding: false
    },
    
    // Avatar Section
    avatarSection: {
        height: 160,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10
    },
    avatarWrapper: {
        width: 120,      
        height: 120,     
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative'
    },
    lottie: {
        width: 300,      
        height: 300,
        position: "absolute", 
    },
    avatar: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: '#e1e1e1',
        borderWidth: 3,     
        borderColor: 'white',
        zIndex: 10,         
    },

    // Info Card
    infoCard: {
        width: '100%',
        borderRadius: 20,
        padding: 16,
        alignItems: 'center',
        
        marginBottom: 20
    },
    subtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 16,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(74, 222, 128, 0.1)', 
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 8
    },
    statLabel: {
        fontSize: 14,
    },
    statValue: {
        fontSize: 18,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false
    },

    // Button
    buttonContainer: {
        width: '100%',
        shadowColor: "#7c3aed",
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    gradientButton: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row'
    },
    buttonText: {
        color: 'white',
        fontSize: 18,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false
    }
});

export default ShareModal;