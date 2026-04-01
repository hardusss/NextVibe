import React, { useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetBackdropProps
} from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, Trash2 } from 'lucide-react-native';
import { usePopup } from '../Popup';
import setAvatar from '@/src/api/set.avatar';

interface Props {
  isVisible: boolean;
  onClose: () => void;
  onReset?: () => void;
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

const AvatarSheet = ({ isVisible, onClose, onReset }: Props) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  const colors = isDarkMode ? darkColors : lightColors;
  const styles = getStyles(colors);
  const { showPopup } = usePopup();

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

  const onImageSelected = async (uri: string) => {
    setAvatar(uri);
  }

  const handleCameraPress = async () => {
    onClose(); 
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
        <Text style={styles.title}>Change Photo</Text>
        
        <TouchableOpacity style={styles.row} onPress={handleCameraPress}>
          <View style={styles.rowLeft}>
            <Camera size={24} color={colors.iconMain} strokeWidth={1.5} />
            <Text style={styles.rowText}>Take Photo</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={handleGalleryPress}>
          <View style={styles.rowLeft}>
            <ImageIcon size={24} color={colors.iconMain} strokeWidth={1.5} />
            <Text style={styles.rowText}>Choose from Gallery</Text>
          </View>
        </TouchableOpacity>

        {onReset && (
          <TouchableOpacity style={[styles.row, styles.lastRow]} onPress={handleReset}>
            <View style={styles.rowLeft}>
              <Trash2 size={24} color={colors.danger} strokeWidth={1.5} />
              <Text style={styles.dangerText}>Remove Photo</Text>
            </View>
          </TouchableOpacity>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
};

const getStyles = (colors: any) =>
  StyleSheet.create({
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
      marginBottom: 16,
      textAlign: "center"
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
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
      fontWeight: "400",
      marginLeft: 16,
    },
    dangerText: {
      fontSize: 16,
      color: colors.danger,
      fontWeight: "400",
      marginLeft: 16,
    },
  });

export default AvatarSheet;