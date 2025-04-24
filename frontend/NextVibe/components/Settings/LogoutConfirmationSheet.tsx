import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, useColorScheme, PanResponder } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
    isVisible: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

const LogoutConfirmationSheet = ({ isVisible, onClose, onConfirm }: Props) => {
    const isDark = useColorScheme() === 'dark';
    const translateY = useRef(new Animated.Value(300)).current;
    const styles = getStyles(isDark);
    
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    translateY.setValue(gestureState.dy);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 50) {
                    onClose();
                } else {
                    Animated.spring(translateY, {
                        toValue: 0,
                        useNativeDriver: true,
                        tension: 100,
                        friction: 8
                    }).start();
                }
            },
        })
    ).current;

    useEffect(() => {
        Animated.spring(translateY, {
            toValue: isVisible ? 0 : 300,
            useNativeDriver: true,
            tension: 100,
            friction: 8
        }).start();
        
        // Add handler for onConfirm to close the modal window after logout
        if (isVisible && onConfirm) {
            const originalOnConfirm = onConfirm;
            onConfirm = () => {
                originalOnConfirm();
                onClose();
            };
        }
    }, [isVisible]);

    if (!isVisible) return null;

    return (
        <View style={styles.overlay}>
            <TouchableOpacity style={styles.overlayTouchable} onPress={onClose} activeOpacity={1} />
            <Animated.View style={[styles.container, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
                <View style={styles.headerContainer}>
                    <MaterialCommunityIcons name="logout" size={30} color={isDark ? "#05f0d8" : "#007bff"} />
                    <Text style={styles.title}>Logout Confirmation</Text>
                </View>
                
                <Text style={styles.message}>Are you sure you want to log out of your account?</Text>
                
                <View style={styles.buttonContainer}>
                    <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={() => {
                        onConfirm();
                        onClose();
                    }}>
                        <Text style={styles.confirmButtonText}>Yes, log out</Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </View>
    );
};

const darkColors = {
    background: 'rgb(31, 31, 32)',
    buttonBackground: '#1f1f1f',
    textColor: '#c9d1d9',
    accent: '#05f0d8',
    overlay: 'rgba(0, 0, 0, 0.5)',
    cancelButton: '#333333',
    confirmButton: '#d32f2f'
};

const lightColors = {
    background: '#ffffff',
    buttonBackground: '#e5e5e5',
    textColor: '#000000',
    accent: '#007bff',
    overlay: 'rgba(0, 0, 0, 0.3)',
    cancelButton: '#e0e0e0',
    confirmButton: '#f44336'
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: isDark ? darkColors.overlay : lightColors.overlay,
        justifyContent: 'center',
        alignItems: 'center'
    },
    overlayTouchable: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    container: {
        backgroundColor: isDark ? darkColors.background : lightColors.background,
        borderRadius: 20,
        padding: 20,
        width: '80%',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
        justifyContent: 'center'
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: isDark ? darkColors.textColor : lightColors.textColor,
        marginLeft: 10,
    },
    message: {
        fontSize: 16,
        color: isDark ? darkColors.textColor : lightColors.textColor,
        marginBottom: 20,
        textAlign: 'center',
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    button: {
        padding: 12,
        borderRadius: 10,
        alignItems: 'center',
        flex: 1,
        marginHorizontal: 5,
    },
    cancelButton: {
        backgroundColor: isDark ? darkColors.cancelButton : lightColors.cancelButton,
    },
    confirmButton: {
        backgroundColor: isDark ? darkColors.confirmButton : lightColors.confirmButton,
    },
    cancelButtonText: {
        color: isDark ? darkColors.textColor : lightColors.textColor,
        fontWeight: 'bold',
        fontSize: 16,
    },
    confirmButtonText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 16,
    },
});

export default LogoutConfirmationSheet;