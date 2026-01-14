import { StyleSheet } from "react-native";

/**
 * Wallet Styles Module
 * 
 * Centralized styling for wallet dashboard components.
 * Provides theme-aware styles with consistent design language.
 * 
 * Design System:
 * - Glassmorphism: Blur effects with semi-transparent backgrounds
 * - Purple accent: #A78BFA (dark) / #5856D6 (light)
 * - Subtle borders: Semi-transparent white/black
 * - Consistent spacing: 8px base unit system
 * 
 * Color Palette:
 * Dark Mode:
 * - Background: #0A0410, #1a0a2e
 * - Text Primary: #FFFFFF
 * - Text Secondary: rgba(255, 255, 255, 0.6-0.7)
 * - Accent: #A78BFA
 * 
 * Light Mode:
 * - Background: #FFFFFF, #dbd4fbff
 * - Text Primary: #000000
 * - Text Secondary: rgba(0, 0, 0, 0.5-0.6)
 * - Accent: #5856D6
 * 
 * @param isDarkMode - Boolean flag for theme selection
 * @returns StyleSheet object with all wallet styles
 */
export const createWalletStyles = (isDarkMode: boolean) =>
  StyleSheet.create({
    // ========================================
    // Layout Containers
    // ========================================
    
    /** Root container for gradient background */
    container: {
      flex: 1,
    },

    /** ScrollView content wrapper with bottom padding */
    scrollContent: {
      paddingBottom: 30,
    },

    // ========================================
    // Spacing & Utilities
    // ========================================

    /** Standard horizontal padding for sections */
    sectionPadding: {
      paddingHorizontal: 20,
    },

    /** Standard vertical spacing between sections */
    sectionMargin: {
      marginBottom: 30,
    },
  });

/**
 * Theme Color Constants
 * 
 * Provides consistent color values across components.
 * Use these instead of hardcoded colors for maintainability.
 */
export const WalletColors = {
  dark: {
    primary: "#FFFFFF",
    secondary: "rgba(255, 255, 255, 0.7)",
    tertiary: "rgba(255, 255, 255, 0.4)",
    accent: "#A78BFA",
    border: "rgba(255, 255, 255, 0.15)",
    separator: "rgba(255, 255, 255, 0.1)",
    skeleton: "rgba(255, 255, 255, 0.1)",
    error: "#FF6B6B",
    warning: "#FFA500",
  },
  light: {
    primary: "#000000",
    secondary: "rgba(0, 0, 0, 0.6)",
    tertiary: "rgba(0, 0, 0, 0.4)",
    accent: "#5856D6",
    border: "rgba(220, 220, 220, 0.5)",
    separator: "rgba(0, 0, 0, 0.08)",
    skeleton: "rgba(0, 0, 0, 0.1)",
    error: "#E74C3C",
    warning: "#D2691E",
  },
} as const;

/**
 * Typography Constants
 * 
 * Standardized font sizes and weights.
 */
export const WalletTypography = {
  sizes: {
    tiny: 12,
    small: 13,
    body: 14,
    medium: 16,
    large: 20,
    xlarge: 32,
    xxlarge: 48,
  },
  weights: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    extrabold: "800" as const,
  },
} as const;

/**
 * Spacing Constants
 * 
 * 8px base unit system for consistent spacing.
 */
export const WalletSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 30,
  xxxl: 40,
} as const;

/**
 * Border Radius Constants
 * 
 * Standardized corner radius values.
 */
export const WalletBorderRadius = {
  small: 12,
  medium: 20,
  large: 24,
  circle: 50,
} as const;