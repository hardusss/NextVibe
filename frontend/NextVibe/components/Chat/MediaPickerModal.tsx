import React from 'react';
import { View, Modal, TouchableOpacity, Text, StyleSheet, useColorScheme, TouchableWithoutFeedback } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

interface MediaPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onCameraPress: () => void;
  onGalleryPress: () => void;
}

export default function MediaPickerModal({
  visible,
  onClose,
  onCameraPress,
  onGalleryPress
}: MediaPickerModalProps) {
  const isDark = useColorScheme() === 'dark';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <BlurView
            style={styles.overlayBlur}
            intensity={isDark ? 20 : 40}
            tint={isDark ? 'dark' : 'light'}
        />
        <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={[
                styles.modalContainer,
                { borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(220, 220, 220, 0.5)' }
            ]}>
                <BlurView
                    intensity={isDark ? 120 : 90}
                    tint={isDark ? 'dark' : 'light'}
                    style={styles.blurViewAbsolute}
                />
                <View style={styles.grabber} />
                
                <Text style={[
                    styles.title,
                    { color: isDark ? '#fff' : '#000' }
                ]}>Select Media</Text>
                
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                    style={styles.option} 
                    onPress={onCameraPress}
                >
                    <MaterialIcons 
                    name="camera-alt" 
                    size={24} 
                    color={isDark ? '#fff' : '#000'} 
                    />
                    <Text style={[
                    styles.optionText,
                    { color: isDark ? '#fff' : '#000' }
                    ]}>Take Photo</Text>
                </TouchableOpacity>
                
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                    style={[styles.option, { borderBottomWidth: 0 }]} 
                    onPress={onGalleryPress}
                >
                    <MaterialIcons 
                    name="photo-library" 
                    size={24} 
                    color={isDark ? '#fff' : '#000'} 
                    />
                    <Text style={[
                    styles.optionText,
                    { color: isDark ? '#fff' : '#000' }
                    ]}>Choose from Gallery</Text>
                </TouchableOpacity>
            </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingTop: 10,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: "#2d1069a3"
  },
  blurViewAbsolute: {
    ...StyleSheet.absoluteFillObject,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(128, 128, 128, 0.5)',
    alignSelf: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
  },
  optionText: {
    fontSize: 16,
    marginLeft: 15,
  },
});