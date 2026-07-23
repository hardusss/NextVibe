import React from 'react';
import { View, Modal, TouchableOpacity, Text, StyleSheet, useColorScheme, TouchableWithoutFeedback } from 'react-native';
import { Camera, Images } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { chatColors, chatRadius } from '@/src/theme/chatTheme';

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
  onGalleryPress,
}: MediaPickerModalProps) {
  const isDark = useColorScheme() === 'dark';
  const colors = chatColors[isDark ? 'dark' : 'light'];

  const handleCamera = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCameraPress();
  };

  const handleGallery = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onGalleryPress();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
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
          <View
            style={[
              styles.modalContainer,
              {
                backgroundColor: isDark ? 'rgba(21, 7, 35, 0.95)' : 'rgba(255, 255, 255, 0.96)',
                borderColor: colors.border,
              },
            ]}
          >
            <BlurView
              intensity={isDark ? 120 : 90}
              tint={isDark ? 'dark' : 'light'}
              style={styles.blurViewAbsolute}
            />
            <View style={[styles.grabber, { backgroundColor: colors.subtext, opacity: 0.3 }]} />

            <Text style={[styles.title, { color: colors.text }]}>Select Media</Text>

            <TouchableOpacity
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              style={[styles.option, { borderBottomColor: colors.divider }]}
              onPress={handleCamera}
              activeOpacity={0.7}
            >
              <Camera size={24} color={colors.text} />
              <Text style={[styles.optionText, { color: colors.text }]}>Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              style={[styles.option, { borderBottomWidth: 0 }]}
              onPress={handleGallery}
              activeOpacity={0.7}
            >
              <Images size={24} color={colors.text} />
              <Text style={[styles.optionText, { color: colors.text }]}>Choose from Gallery</Text>
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
    borderTopLeftRadius: chatRadius.modal,
    borderTopRightRadius: chatRadius.modal,
    padding: 20,
    paddingTop: 10,
    overflow: 'hidden',
    borderWidth: 1,
  },
  blurViewAbsolute: {
    ...StyleSheet.absoluteFillObject,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
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
  },
  optionText: {
    fontSize: 16,
    marginLeft: 15,
    fontWeight: '500',
  },
});