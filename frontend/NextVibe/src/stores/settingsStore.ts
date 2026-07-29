import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, type ColorSchemeName } from 'react-native';
import { WallpaperType, BubbleStyle } from '@/constants/chatWallpapers';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'theme_preference';
const LIQUID_GLASS_KEY = 'liquid_glass_enabled';
const CHAT_WALLPAPER_TYPE_KEY = 'chat_wallpaper_type';
const CHAT_WALLPAPER_VALUE_KEY = 'chat_wallpaper_value';
const CHAT_WALLPAPER_DIMMING_KEY = 'chat_wallpaper_dimming';
const CHAT_WALLPAPER_BLUR_KEY = 'chat_wallpaper_blur';
const CHAT_BUBBLE_STYLE_KEY = 'chat_bubble_style';

function applyThemePreference(preference: ThemePreference) {
    const scheme: ColorSchemeName = preference === 'system' ? 'unspecified' : preference;
    Appearance.setColorScheme(scheme);
}

interface SettingsState {
    themePreference: ThemePreference;
    liquidGlassEnabled: boolean;
    chatWallpaperType: WallpaperType;
    chatWallpaperValue: string;
    chatWallpaperDimming: number;
    chatWallpaperBlur: number;
    chatBubbleStyle: BubbleStyle;
    isHydrated: boolean;

    loadSettings: () => Promise<void>;
    setThemePreference: (preference: ThemePreference) => Promise<void>;
    setLiquidGlassEnabled: (enabled: boolean) => Promise<void>;
    setChatWallpaper: (type: WallpaperType, value: string) => Promise<void>;
    setChatWallpaperDimming: (dimming: number) => Promise<void>;
    setChatWallpaperBlur: (blur: number) => Promise<void>;
    setChatBubbleStyle: (style: BubbleStyle) => Promise<void>;
    resetChatWallpaper: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    themePreference: 'system',
    liquidGlassEnabled: true,
    chatWallpaperType: 'default',
    chatWallpaperValue: '',
    chatWallpaperDimming: 0.2,
    chatWallpaperBlur: 0,
    chatBubbleStyle: 'glass',
    isHydrated: false,

    loadSettings: async () => {
        try {
            const [
                themeValue,
                glassValue,
                wpType,
                wpValue,
                wpDimming,
                wpBlur,
                bubbleStyle,
            ] = await Promise.all([
                AsyncStorage.getItem(THEME_KEY),
                AsyncStorage.getItem(LIQUID_GLASS_KEY),
                AsyncStorage.getItem(CHAT_WALLPAPER_TYPE_KEY),
                AsyncStorage.getItem(CHAT_WALLPAPER_VALUE_KEY),
                AsyncStorage.getItem(CHAT_WALLPAPER_DIMMING_KEY),
                AsyncStorage.getItem(CHAT_WALLPAPER_BLUR_KEY),
                AsyncStorage.getItem(CHAT_BUBBLE_STYLE_KEY),
            ]);

            const themePreference: ThemePreference =
                themeValue === 'light' || themeValue === 'dark' ? themeValue : 'system';
            const liquidGlassEnabled = glassValue !== 'false';
            
            const chatWallpaperType: WallpaperType = (wpType as WallpaperType) || 'default';
            const chatWallpaperValue = wpValue || '';
            const chatWallpaperDimming = wpDimming ? parseFloat(wpDimming) : 0.2;
            const chatWallpaperBlur = wpBlur ? parseInt(wpBlur, 10) : 0;
            const chatBubbleStyle: BubbleStyle = (bubbleStyle as BubbleStyle) || 'glass';

            applyThemePreference(themePreference);

            set({
                themePreference,
                liquidGlassEnabled,
                chatWallpaperType,
                chatWallpaperValue,
                chatWallpaperDimming,
                chatWallpaperBlur,
                chatBubbleStyle,
                isHydrated: true,
            });
        } catch (e) {
            console.warn('[settingsStore] Failed to load settings:', e);
            set({ isHydrated: true });
        }
    },

    setThemePreference: async (preference: ThemePreference) => {
        set({ themePreference: preference });
        applyThemePreference(preference);
        try {
            await AsyncStorage.setItem(THEME_KEY, preference);
        } catch (e) {
            console.warn('[settingsStore] Failed to save theme preference:', e);
        }
    },

    setLiquidGlassEnabled: async (enabled: boolean) => {
        set({ liquidGlassEnabled: enabled });
        try {
            await AsyncStorage.setItem(LIQUID_GLASS_KEY, enabled ? 'true' : 'false');
        } catch (e) {
            console.warn('[settingsStore] Failed to save liquid glass setting:', e);
        }
    },

    setChatWallpaper: async (type: WallpaperType, value: string) => {
        set({ chatWallpaperType: type, chatWallpaperValue: value });
        try {
            await AsyncStorage.setItem(CHAT_WALLPAPER_TYPE_KEY, type);
            await AsyncStorage.setItem(CHAT_WALLPAPER_VALUE_KEY, value);
        } catch (e) {
            console.warn('[settingsStore] Failed to save chat wallpaper:', e);
        }
    },

    setChatWallpaperDimming: async (dimming: number) => {
        set({ chatWallpaperDimming: dimming });
        try {
            await AsyncStorage.setItem(CHAT_WALLPAPER_DIMMING_KEY, String(dimming));
        } catch (e) {
            console.warn('[settingsStore] Failed to save chat dimming:', e);
        }
    },

    setChatWallpaperBlur: async (blur: number) => {
        set({ chatWallpaperBlur: blur });
        try {
            await AsyncStorage.setItem(CHAT_WALLPAPER_BLUR_KEY, String(blur));
        } catch (e) {
            console.warn('[settingsStore] Failed to save chat blur:', e);
        }
    },

    setChatBubbleStyle: async (style: BubbleStyle) => {
        set({ chatBubbleStyle: style });
        try {
            await AsyncStorage.setItem(CHAT_BUBBLE_STYLE_KEY, style);
        } catch (e) {
            console.warn('[settingsStore] Failed to save chat bubble style:', e);
        }
    },

    resetChatWallpaper: async () => {
        set({
            chatWallpaperType: 'default',
            chatWallpaperValue: '',
            chatWallpaperDimming: 0.2,
            chatWallpaperBlur: 0,
            chatBubbleStyle: 'glass',
        });
        try {
            await AsyncStorage.multiRemove([
                CHAT_WALLPAPER_TYPE_KEY,
                CHAT_WALLPAPER_VALUE_KEY,
                CHAT_WALLPAPER_DIMMING_KEY,
                CHAT_WALLPAPER_BLUR_KEY,
                CHAT_BUBBLE_STYLE_KEY,
            ]);
        } catch (e) {
            console.warn('[settingsStore] Failed to reset chat wallpaper:', e);
        }
    },
}));

export function useLiquidGlassEnabled(): boolean {
    return useSettingsStore((state) => state.liquidGlassEnabled);
}

