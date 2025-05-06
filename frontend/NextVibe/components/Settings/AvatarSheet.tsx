import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { usePopup } from '../Popup';
import setAvatar from '@/src/api/set.avatar';

interface Props {
  isVisible: boolean;
  onClose: () => void;
  onReset?: () => void;
}

const AvatarSheet = ({ isVisible, onClose,  onReset }: Props) => {
  const isDark = useColorScheme() === 'dark';
  const { showPopup } = usePopup();

  const onImageSelected = async (uri: string) => {
    setAvatar(uri)
  }

  const handleCameraPress = async () => {
    onClose(); // Закриваємо модальне вікно перед відкриттям камери
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showPopup('error', 'Error', 'Camera permission is required');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets[0].uri) {
        await onImageSelected(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      showPopup('error', 'Error', 'Failed to take photo');
    }
  };

  const handleGalleryPress = async () => {
    onClose(); 
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showPopup('error', 'Error', 'Gallery permission is required');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets[0].uri) {
        await onImageSelected(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      showPopup('error', 'Error', 'Failed to pick image');
    }
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
      onClose();
    }
  };

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={onClose}
        />
        <View style={[styles.content, { backgroundColor: isDark ? '#1a1a1a' : '#fff' }]}>
          <TouchableOpacity 
            style={[styles.option, { backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0' }]} 
            onPress={handleCameraPress}
          >
            <MaterialIcons name="camera-alt" size={24} color={isDark ? '#fff' : '#000'} />
            <Text style={[styles.optionText, { color: isDark ? '#fff' : '#000' }]}>
              Take Photo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.option, { backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0' }]} 
            onPress={handleGalleryPress}
          >
            <MaterialIcons name="photo-library" size={24} color={isDark ? '#fff' : '#000'} />
            <Text style={[styles.optionText, { color: isDark ? '#fff' : '#000' }]}>
              Choose from Gallery
            </Text>
          </TouchableOpacity>

          {onReset && (
            <TouchableOpacity 
              style={[styles.option, styles.resetOption]} 
              onPress={handleReset}
            >
              <MaterialIcons name="delete" size={24} color="#ff4444" />
              <Text style={[styles.optionText, { color: '#ff4444' }]}>
                Remove Photo
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  optionText: {
    fontSize: 16,
    marginLeft: 12,
  },
  resetOption: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ff4444',
  }
});

export default AvatarSheet;
