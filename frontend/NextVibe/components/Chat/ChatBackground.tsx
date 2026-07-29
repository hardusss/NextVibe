import React from 'react';
import { View, StyleSheet, Image, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSettingsStore } from '@/src/stores/settingsStore';
import { chatColors } from '@/src/theme/chatTheme';

interface Props {
  children?: React.ReactNode;
  overrideType?: string;
  overrideValue?: string;
  overrideDimming?: number;
  overrideBlur?: number;
}

export const ChatBackground: React.FC<Props> = ({
  children,
  overrideType,
  overrideValue,
  overrideDimming,
  overrideBlur,
}) => {
  const isDark = useColorScheme() === 'dark';
  const storeType = useSettingsStore((state) => state.chatWallpaperType);
  const storeValue = useSettingsStore((state) => state.chatWallpaperValue);
  const storeDimming = useSettingsStore((state) => state.chatWallpaperDimming);
  const storeBlur = useSettingsStore((state) => state.chatWallpaperBlur);

  const type = overrideType || storeType;
  const value = overrideValue !== undefined ? overrideValue : storeValue;
  const dimming = overrideDimming !== undefined ? overrideDimming : storeDimming;
  const blur = overrideBlur !== undefined ? overrideBlur : storeBlur;

  const colors = chatColors[isDark ? 'dark' : 'light'];

  const renderBackgroundContent = () => {
    if (type === 'default' || !value) {
      return (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: colors.bg },
          ]}
        />
      );
    }

    if (type === 'color') {
      return (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: value },
          ]}
        />
      );
    }

    if (type === 'gradient') {
      const gradientColors = value.split(',').map((c) => c.trim()).filter(Boolean);
      const safeColors = gradientColors.length >= 2 ? gradientColors : ['#0a0410', '#1a0b2e', '#09182b'];
      return (
        <LinearGradient
          colors={safeColors as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      );
    }

    if (type === 'preset' || type === 'custom') {
      if (value.includes(',')) {
        // Gradient preset fallback
        const gradientColors = value.split(',').map((c) => c.trim()).filter(Boolean);
        const safeColors = gradientColors.length >= 2 ? gradientColors : ['#0a0410', '#1a0b2e'];
        return (
          <LinearGradient
            colors={safeColors as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        );
      }
      return (
        <Image
          source={{ uri: value }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      );
    }

    return (
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: colors.bg },
        ]}
      />
    );
  };

  return (
    <View style={styles.container}>
      {renderBackgroundContent()}

      {/* Wallpaper Dimming Overlay */}
      {dimming > 0 && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: isDark ? '#000000' : '#ffffff',
              opacity: dimming,
            },
          ]}
          pointerEvents="none"
        />
      )}

      {/* Optional Blur Overlay */}
      {blur > 0 && (
        <BlurView
          intensity={Math.min(blur * 3.3, 100)}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      )}

      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
});
