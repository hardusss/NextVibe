import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, type ColorSchemeName } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'theme_preference';
const LIQUID_GLASS_KEY = 'liquid_glass_enabled';

function applyThemePreference(preference: ThemePreference) {
    const scheme: ColorSchemeName = preference === 'system' ? 'unspecified' : preference;
    Appearance.setColorScheme(scheme);
}

interface SettingsState {
    themePreference: ThemePreference;
    liquidGlassEnabled: boolean;
    isHydrated: boolean;

    loadSettings: () => Promise<void>;
    setThemePreference: (preference: ThemePreference) => Promise<void>;
    setLiquidGlassEnabled: (enabled: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    themePreference: 'system',
    liquidGlassEnabled: true,
    isHydrated: false,

    loadSettings: async () => {
        try {
            const [themeValue, glassValue] = await Promise.all([
                AsyncStorage.getItem(THEME_KEY),
                AsyncStorage.getItem(LIQUID_GLASS_KEY),
            ]);

            const themePreference: ThemePreference =
                themeValue === 'light' || themeValue === 'dark' ? themeValue : 'system';
            const liquidGlassEnabled = glassValue !== 'false';

            applyThemePreference(themePreference);

            set({
                themePreference,
                liquidGlassEnabled,
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
}));

export function useLiquidGlassEnabled(): boolean {
    return useSettingsStore((state) => state.liquidGlassEnabled);
}
