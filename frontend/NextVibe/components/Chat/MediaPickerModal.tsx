import React from 'react';
import { View, Modal, TouchableOpacity, Text, StyleSheet, useColorScheme } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

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
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <View style={[
          styles.modalContent,
          { backgroundColor: isDark ? '#1a1a1a' : '#fff' }
        ]}>
          <Text style={[
            styles.title,
            { color: isDark ? '#fff' : '#000' }
          ]}>Select Media</Text>
          
          <TouchableOpacity 
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
          
          <TouchableOpacity 
            style={styles.option} 
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
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
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
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  optionText: {
    fontSize: 16,
    marginLeft: 15,
  },
});
