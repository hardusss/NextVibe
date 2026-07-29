import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  useColorScheme,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, Image as ImageIcon, Sparkles, Sliders, RefreshCw, Palette, Layers } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Slider from '@react-native-community/slider';
import { useSettingsStore } from '@/src/stores/settingsStore';
import { ChatBackground } from '@/components/Chat/ChatBackground';
import { WALLPAPER_PRESETS, BUBBLE_STYLES, WallpaperType, BubbleStyle, WallpaperItem, getWallpaperColors } from '@/constants/chatWallpapers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const ChatWallpaperModal: React.FC<Props> = ({ visible, onClose }) => {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  const storeType = useSettingsStore((state) => state.chatWallpaperType);
  const storeValue = useSettingsStore((state) => state.chatWallpaperValue);
  const storeDimming = useSettingsStore((state) => state.chatWallpaperDimming);
  const storeBlur = useSettingsStore((state) => state.chatWallpaperBlur);
  const storeBubbleStyle = useSettingsStore((state) => state.chatBubbleStyle);

  const setChatWallpaper = useSettingsStore((state) => state.setChatWallpaper);
  const setChatWallpaperDimming = useSettingsStore((state) => state.setChatWallpaperDimming);
  const setChatWallpaperBlur = useSettingsStore((state) => state.setChatWallpaperBlur);
  const setChatBubbleStyle = useSettingsStore((state) => state.setChatBubbleStyle);
  const resetChatWallpaper = useSettingsStore((state) => state.resetChatWallpaper);
  const liquidGlassEnabled = useSettingsStore((state) => state.liquidGlassEnabled);

  const [activeTab, setActiveTab] = useState<'presets' | 'colors' | 'custom' | 'customize'>('presets');

  const [selectedType, setSelectedType] = useState<WallpaperType>(storeType);
  const [selectedValue, setSelectedValue] = useState<string>(storeValue);
  const [dimming, setDimming] = useState<number>(storeDimming);
  const [blur, setBlur] = useState<number>(storeBlur);
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>(storeBubbleStyle);

  const previewWpColors = getWallpaperColors(selectedType, selectedValue, isDark);

  useEffect(() => {
    if (visible) {
      setSelectedType(storeType);
      setSelectedValue(storeValue);
      setDimming(storeDimming);
      setBlur(storeBlur);
      setBubbleStyle(storeBubbleStyle);
    }
  }, [visible, storeType, storeValue, storeDimming, storeBlur, storeBubbleStyle]);

  const handleSelectPreset = (item: WallpaperItem) => {
    Haptics.selectionAsync();
    setSelectedType(item.type);
    setSelectedValue(item.value);
  };

  const handlePickCustomImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alert('Permission to access camera roll is required!');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSelectedType('custom');
        setSelectedValue(result.assets[0].uri);
      }
    } catch (e) {
      console.warn('Failed to pick custom wallpaper:', e);
    }
  };

  const handleApply = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setChatWallpaper(selectedType, selectedValue);
    await setChatWallpaperDimming(dimming);
    await setChatWallpaperBlur(blur);
    await setChatBubbleStyle(bubbleStyle);
    onClose();
  };

  const handleReset = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await resetChatWallpaper();
    setSelectedType('default');
    setSelectedValue('');
    setDimming(0.2);
    setBlur(0);
    setBubbleStyle('glass');
  };

  const colors = {
    bg: isDark ? '#0A0410' : '#FFFFFF',
    cardBg: isDark ? '#150B24' : '#F5F3FF',
    text: isDark ? '#FFFFFF' : '#1A1225',
    subtext: isDark ? '#94A3B8' : '#64748B',
    accent: isDark ? '#A78BFA' : '#7C3AED',
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    tabActive: isDark ? '#8B5CF6' : '#7C3AED',
    tabInactive: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: Platform.OS === 'android' ? insets.top : 12 }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity style={styles.iconButton} onPress={onClose} activeOpacity={0.7}>
            <X size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Chat Background & Theme</Text>
            <Text style={[styles.headerSubtitle, { color: colors.subtext }]}>Customize wallpaper & bubble style</Text>
          </View>

          <TouchableOpacity
            style={[styles.applyButton, { backgroundColor: colors.accent }]}
            onPress={handleApply}
            activeOpacity={0.8}
          >
            <Text style={styles.applyButtonText}>Apply</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        >
          {/* Live Preview Box */}
          <View style={styles.previewSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>LIVE PREVIEW</Text>
            <View style={[styles.previewFrame, { borderColor: colors.border }]}>
              <ChatBackground
                overrideType={selectedType}
                overrideValue={selectedValue}
                overrideDimming={dimming}
                overrideBlur={blur}
              >
                <View style={styles.previewInner}>
                  {/* Mock Message 1 (Received) */}
                  <View
                    style={[
                      styles.mockBubble,
                      styles.mockReceived,
                      {
                        backgroundColor: isDark ? 'rgba(24, 12, 38, 0.94)' : 'rgba(242, 240, 248, 0.96)',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                      },
                    ]}
                  >
                    <Text style={[styles.mockReceivedText, { color: isDark ? '#FFFFFF' : '#1A1225' }]}>
                      Hey! Check out this awesome chat wallpaper ✨
                    </Text>
                    <Text style={[styles.mockTime, { color: isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)' }]}>10:42 AM</Text>
                  </View>

                  {/* Mock Message 2 (Sent) */}
                  <View style={[styles.mockBubble, styles.mockSent, { backgroundColor: previewWpColors.bubbleMine }]}>
                    <Text style={styles.mockSentText}>Looks ultra modern and clean! 🚀</Text>
                    <View style={styles.mockMeta}>
                      <Text style={styles.mockSentTime}>10:43 AM</Text>
                      <Check size={12} color="#FFFFFF" style={{ marginLeft: 4 }} />
                    </View>
                  </View>

                  {/* Mock Input Capsule */}
                  <View
                    style={[
                      styles.mockInputCapsule,
                      {
                        backgroundColor: liquidGlassEnabled
                          ? (isDark ? 'rgba(10, 4, 16, 0.38)' : 'rgba(255, 255, 255, 0.45)')
                          : (isDark ? 'rgba(18, 10, 28, 0.94)' : 'rgba(255, 255, 255, 0.96)'),
                        borderColor: previewWpColors.inputBorder,
                      },
                    ]}
                  >
                    <Text style={{ color: colors.subtext, fontSize: 13 }}>Message...</Text>
                    <View style={[styles.mockSendBtn, { backgroundColor: previewWpColors.accent }]}>
                      <Sparkles size={14} color="#FFF" />
                    </View>
                  </View>
                </View>
              </ChatBackground>
            </View>
          </View>

          {/* Navigation Category Tabs */}
          <View style={styles.tabsRow}>
            {[
              { id: 'presets', label: 'Presets', icon: Sparkles },
              { id: 'colors', label: 'Gradients', icon: Palette },
              { id: 'custom', label: 'Photo', icon: ImageIcon },
              { id: 'customize', label: 'Styling', icon: Sliders },
            ].map((tab) => {
              const IconComp = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.tabPill,
                    { backgroundColor: isActive ? colors.tabActive : colors.tabInactive },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setActiveTab(tab.id as any);
                  }}
                  activeOpacity={0.8}
                >
                  <IconComp size={15} color={isActive ? '#FFFFFF' : colors.subtext} />
                  <Text style={[styles.tabLabel, { color: isActive ? '#FFFFFF' : colors.subtext }]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* TAB 1: PRESETS */}
          {activeTab === 'presets' && (
            <View style={styles.tabContent}>
              <View style={styles.presetsGrid}>
                {/* Default System Theme Card */}
                <TouchableOpacity
                  style={[
                    styles.presetCard,
                    { borderColor: selectedType === 'default' ? colors.accent : colors.border },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedType('default');
                    setSelectedValue('');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.presetPreviewBox, { backgroundColor: colors.cardBg }]}>
                    <RefreshCw size={24} color={colors.accent} />
                    <Text style={[styles.presetCardTitle, { color: colors.text, marginTop: 6 }]}>Default</Text>
                  </View>
                  {selectedType === 'default' && (
                    <View style={[styles.checkBadge, { backgroundColor: colors.accent }]}>
                      <Check size={12} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>

                {/* Preset List */}
                {WALLPAPER_PRESETS.filter((p) => p.category === 'preset' || p.category === 'gradient').map((preset) => {
                  const isSelected = selectedType === preset.type && selectedValue === preset.value;
                  return (
                    <TouchableOpacity
                      key={preset.id}
                      style={[
                        styles.presetCard,
                        { borderColor: isSelected ? colors.accent : colors.border },
                      ]}
                      onPress={() => handleSelectPreset(preset)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.presetPreviewBox}>
                        <ChatBackground overrideType={preset.type} overrideValue={preset.value} overrideDimming={0} overrideBlur={0} />
                        <Text style={styles.presetCardOverlayText}>{preset.name}</Text>
                      </View>
                      {isSelected && (
                        <View style={[styles.checkBadge, { backgroundColor: colors.accent }]}>
                          <Check size={12} color="#FFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* TAB 2: GRADIENTS & COLORS */}
          {activeTab === 'colors' && (
            <View style={styles.tabContent}>
              <Text style={[styles.subSectionTitle, { color: colors.subtext }]}>GRADIENT THEMES</Text>
              <View style={styles.colorGrid}>
                {WALLPAPER_PRESETS.filter((p) => p.category === 'gradient').map((item) => {
                  const isSelected = selectedType === item.type && selectedValue === item.value;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.colorCard,
                        { borderColor: isSelected ? colors.accent : colors.border },
                      ]}
                      onPress={() => handleSelectPreset(item)}
                      activeOpacity={0.8}
                    >
                      <ChatBackground overrideType={item.type} overrideValue={item.value} overrideDimming={0} overrideBlur={0} />
                      {isSelected && (
                        <View style={[styles.checkBadge, { backgroundColor: colors.accent }]}>
                          <Check size={12} color="#FFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.subSectionTitle, { color: colors.subtext, marginTop: 18 }]}>SOLID COLORS</Text>
              <View style={styles.colorGrid}>
                {WALLPAPER_PRESETS.filter((p) => p.category === 'solid').map((item) => {
                  const isSelected = selectedType === item.type && selectedValue === item.value;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.colorCard,
                        { backgroundColor: item.value, borderColor: isSelected ? colors.accent : colors.border },
                      ]}
                      onPress={() => handleSelectPreset(item)}
                      activeOpacity={0.8}
                    >
                      {isSelected && (
                        <View style={[styles.checkBadge, { backgroundColor: colors.accent }]}>
                          <Check size={12} color="#FFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* TAB 3: CUSTOM PHOTO */}
          {activeTab === 'custom' && (
            <View style={styles.tabContent}>
              <TouchableOpacity
                style={[styles.uploadBox, { borderColor: colors.accent, backgroundColor: colors.cardBg }]}
                onPress={handlePickCustomImage}
                activeOpacity={0.8}
              >
                <ImageIcon size={36} color={colors.accent} />
                <Text style={[styles.uploadTitle, { color: colors.text }]}>Choose Photo from Device</Text>
                <Text style={[styles.uploadSubtext, { color: colors.subtext }]}>Select any custom wallpaper or background image</Text>
              </TouchableOpacity>

              {selectedType === 'custom' && selectedValue ? (
                <View style={styles.customSelectedBox}>
                  <Text style={[styles.subSectionTitle, { color: colors.subtext }]}>CURRENT CUSTOM PHOTO</Text>
                  <Image source={{ uri: selectedValue }} style={styles.customImagePreview} />
                </View>
              ) : null}
            </View>
          )}

          {/* TAB 4: STYLING & CONTROLS */}
          {activeTab === 'customize' && (
            <View style={styles.tabContent}>
              <Text style={[styles.subSectionTitle, { color: colors.subtext }]}>CHAT BUBBLE STYLE</Text>
              <View style={styles.bubbleStyleGrid}>
                {BUBBLE_STYLES.map((style) => {
                  const isSelected = bubbleStyle === style.id;
                  return (
                    <TouchableOpacity
                      key={style.id}
                      style={[
                        styles.bubbleStyleCard,
                        {
                          backgroundColor: colors.cardBg,
                          borderColor: isSelected ? colors.accent : colors.border,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setBubbleStyle(style.id);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.bubbleStyleTitle, { color: colors.text }]}>{style.name}</Text>
                        <Text style={[styles.bubbleStyleDesc, { color: colors.subtext }]}>{style.description}</Text>
                      </View>
                      {isSelected && (
                        <View style={[styles.checkBadgeSmall, { backgroundColor: colors.accent }]}>
                          <Check size={12} color="#FFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Wallpaper Dimming Slider */}
              <View style={styles.sliderSection}>
                <View style={styles.sliderHeader}>
                  <Text style={[styles.sliderLabel, { color: colors.text }]}>Wallpaper Darkening / Tint</Text>
                  <Text style={[styles.sliderValue, { color: colors.accent }]}>{Math.round(dimming * 100)}%</Text>
                </View>
                <Slider
                  value={dimming}
                  onValueChange={setDimming}
                  minimumValue={0}
                  maximumValue={0.8}
                  step={0.05}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.accent}
                />
              </View>

              {/* Wallpaper Blur Slider */}
              <View style={styles.sliderSection}>
                <View style={styles.sliderHeader}>
                  <Text style={[styles.sliderLabel, { color: colors.text }]}>Background Blur Radius</Text>
                  <Text style={[styles.sliderValue, { color: colors.accent }]}>{blur}px</Text>
                </View>
                <Slider
                  value={blur}
                  onValueChange={setBlur}
                  minimumValue={0}
                  maximumValue={25}
                  step={1}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.accent}
                />
              </View>
            </View>
          )}

          {/* Reset Button */}
          <TouchableOpacity
            style={[styles.resetButton, { borderColor: colors.border }]}
            onPress={handleReset}
            activeOpacity={0.7}
          >
            <RefreshCw size={16} color={colors.subtext} style={{ marginRight: 8 }} />
            <Text style={[styles.resetButtonText, { color: colors.subtext }]}>Reset Wallpaper to Default</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  iconButton: {
    padding: 6,
  },
  applyButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  previewSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  previewFrame: {
    height: 190,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewInner: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  mockBubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    maxWidth: '75%',
  },
  bubbleGlass: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  bubbleSolid: {
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  mockReceived: {
    alignSelf: 'flex-start',
  },
  mockReceivedText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  mockTime: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    marginTop: 3,
    alignSelf: 'flex-end',
  },
  mockSent: {
    alignSelf: 'flex-end',
  },
  mockSentText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  mockMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 3,
  },
  mockSentTime: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10,
  },
  mockInputCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  mockSendBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    marginHorizontal: 3,
    borderRadius: 16,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 5,
  },
  tabContent: {
    marginBottom: 20,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  presetCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    height: 110,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  presetPreviewBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetCardOverlayText: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowRadius: 4,
  },
  presetCardTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorCard: {
    width: (SCREEN_WIDTH - 64) / 4,
    height: 65,
    borderRadius: 14,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  uploadBox: {
    padding: 24,
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  uploadSubtext: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  customSelectedBox: {
    marginTop: 20,
  },
  customImagePreview: {
    width: '100%',
    height: 160,
    borderRadius: 16,
  },
  bubbleStyleGrid: {
    marginBottom: 16,
  },
  bubbleStyleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  bubbleStyleTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  bubbleStyleDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  checkBadgeSmall: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  sliderSection: {
    marginBottom: 16,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sliderLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  sliderValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
