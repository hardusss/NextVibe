import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, useColorScheme, PanResponder, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import GetApiUrl from '@/src/utils/url_api';
import setAvatar from '@/src/api/set.avatar';
import { usePopup } from '../Popup';


interface Props {
    isVisible: boolean;
    onClose: () => void;
    onReset?: () => void;
    avatar?: string;
}

const AvatarSheet = ({ isVisible, onClose, onReset, avatar }: Props) => {
const isDark = useColorScheme() === 'dark';
const translateY = useRef(new Animated.Value(300)).current;
const { showPopup } = usePopup();
const onAvatarChange = (uri: string) => {
    setAvatar(uri);
};
const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
    });

    if (!result.canceled && result.assets[0].uri) {
        onAvatarChange?.(result.assets[0].uri);
        onClose();
    }
};

const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
        showPopup('error', 'Error', 'We need permission to use the camera for this feature!');
        return;
    }

    const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
    });

    if (!result.canceled && result.assets[0].uri) {
        setAvatar(result.assets[0].uri);
        showPopup('success', 'Success', 'Avatar successfully updated');
        onClose();
    }
};

const handleReset = () => {
    onReset?.();
    showPopup('info', 'Information', 'Avatar has been reset to default');
    onClose();
};

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
}, [isVisible]);

if (!isVisible) return null;

return (
    <View style={styles.overlay}>
        <TouchableOpacity style={styles.overlayTouchable} onPress={onClose} activeOpacity={1} />
        <Animated.View style={[styles.container, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
            <View style={styles.avatarContainer}>
                <Image source={{ uri: `${GetApiUrl().slice(0, 26)}${avatar}` }} style={styles.avatar} />
            </View>

            <TouchableOpacity style={styles.button} onPress={pickImage}>
                <MaterialCommunityIcons name="image" size={24} color="#c9d1d9" />
                <Text style={styles.buttonText}>Set avatar from gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.button} onPress={takePhoto}>
                <MaterialCommunityIcons name="camera" size={24} color="#c9d1d9" />
                <Text style={styles.buttonText}>Take avatar by camera</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, styles.resetButton]} onPress={handleReset}>
                <MaterialCommunityIcons name="delete" size={24} color="red" />
                <Text style={[styles.buttonText, {color: "red"}]}>Reset</Text>
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
        backgroundColor: isDark ? darkColors.overlay : lightColors.overlay,
        justifyContent: 'flex-end',
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
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: 40,
        elevation: 5,
    },
    avatarContainer: {
        alignItems: 'center',
        marginBottom: 20,
    },
    avatar: {
        width: 70,
        height: 70,
        borderRadius: 50,
    },
    closeButton: {
        alignSelf: 'flex-end',
        padding: 10,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderRadius: 10,
        marginVertical: 8,
    },
    buttonText: {
        color: isDark ? darkColors.textColor : lightColors.textColor,
        fontSize: 16,
        marginLeft: 10,
        fontWeight: '500',
    },
    resetButton: {
        
    },
});

export default AvatarSheet;