import React, { useRef, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, useColorScheme, PanResponder, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { height } = Dimensions.get('window');

interface MessagePopupProps {
    isVisible: boolean;
    onClose: () => void;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
}

const MessagePopup = ({ isVisible, onClose, type, title, message }: MessagePopupProps) => {
    const isDark = useColorScheme() === 'dark';
    const translateY = useRef(new Animated.Value(300)).current;
    const [modalVisible, setModalVisible] = useState(false);
    const styles = getStyles(isDark);

    const getIconName = () => {
        switch (type) {
            case 'success':
                return 'check-circle';
            case 'error':
                return 'alert-circle';
            case 'info':
                return 'information';
            default:
                return 'information';
        }
    };

    const getIconColor = () => {
        switch (type) {
            case 'success':
                return '#05f0d8';
            case 'error':
                return '#ff4d4d';
            case 'info':
                return '#58a6ff';
            default:
                return '#58a6ff';
        }
    };

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
                    closeModal();
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

    const openModal = () => {
        setModalVisible(true);
        Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 8
        }).start();
    };

    const closeModal = () => {
        Animated.timing(translateY, {
            toValue: height,
            duration: 300,
            useNativeDriver: true,
        }).start(() => {
            setModalVisible(false);
            onClose();
        });
    };

    useEffect(() => {
        if (isVisible) {
            openModal();
            // Automatically close the message after 3 seconds
            const timer = setTimeout(() => {
                closeModal();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isVisible]);

    if (!isVisible && !modalVisible) return null;

    return (
        <View style={styles.overlay}>
            <TouchableOpacity style={styles.overlayTouchable} onPress={closeModal} activeOpacity={1} />
            <Animated.View 
                style={[styles.container, { transform: [{ translateY }] }]} 
                {...panResponder.panHandlers}
            >
                <View style={styles.headerContainer}>
                    <MaterialCommunityIcons name={getIconName()} size={30} color={getIconColor()} />
                    <Text style={styles.title}>{title}</Text>
                    <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                        <MaterialCommunityIcons name="close" size={24} color={isDark ? "#c9d1d9" : "#666"} />
                    </TouchableOpacity>
                </View>
                
                <Text style={styles.message}>{message}</Text>
                
                <TouchableOpacity style={styles.button} onPress={closeModal}>
                    <Text style={styles.buttonText}>OK</Text>
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
};

const darkColors = {
    background: 'rgb(31, 31, 32)',
    buttonBackground: '#1f1f1f',
    textColor: '#c9d1d9',
    accent: '#00E4FF',
    overlay: 'rgba(0, 0, 0, 0.5)'
};

const lightColors = {
    background: '#ffffff',
    cardBackground: '#f5f5f5',
    buttonBackground: '#e5e5e5',
    textColor: '#000000',
    overlay: 'rgba(0, 0, 0, 0.3)'
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
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
        borderRadius: 15,
        padding: 20,
        width: '85%',
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
        position: 'relative',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: isDark ? darkColors.textColor : lightColors.textColor,
        marginLeft: 10,
        flex: 1,
    },
    closeButton: {
        position: 'absolute',
        right: 0,
        top: 0,
    },
    message: {
        fontSize: 16,
        color: isDark ? darkColors.textColor : lightColors.textColor,
        marginBottom: 20,
    },
    button: {
        backgroundColor: '#05f0d8',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    buttonText: {
        color: isDark ? '#000' : '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
});

export default MessagePopup;