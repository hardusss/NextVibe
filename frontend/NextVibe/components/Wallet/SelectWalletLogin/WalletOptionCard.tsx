import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from '@react-native-community/blur';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';

export type WalletType = 'mwa' | 'lazorkit';

export interface WalletAccent {
  primary: string;
  secondary: string;
  gradientStart: string;
  gradientEnd: string;
}

export interface WalletCardConfig {
  id: WalletType;
  title: string;
  subtitle: string;
  ctaLabel: string;
  accent: WalletAccent;
  featurePills: string[];
}

export interface WalletOptionCardProps {
  config: WalletCardConfig;
  isExpanded: boolean;
  /** When true — this is the non-selected sibling, dims and scales down. */
  isDimmed: boolean;
  onCardPress: (id: WalletType) => void;
  /** Wire your MWA / LazorKit logic here — currently a no-op stub. */
  onCtaPress: (id: WalletType) => void;
}

const COLORS = {
  dark: { textPrimary: '#F0ECFF', textSecondary: '#9B8EC4' },
  light: { textPrimary: '#180D30', textSecondary: '#5A4D7A' },
};

const SPRING = { damping: 22, stiffness: 200, mass: 0.8 };
const SOFT_SPRING = { damping: 26, stiffness: 160, mass: 1 };
const CARD_COLLAPSED_HEIGHT = 130;
const CARD_EXPANDED_HEIGHT = 288;

/**
 * Accordion-style card for a single wallet connection option.
 *
 * Hook order is always fixed — no conditional hook calls anywhere.
 * BlurView is isolated in its own sub-component so its internal hooks
 * never affect the parent's hook order.
 */
export const WalletOptionCard: React.FC<WalletOptionCardProps> = ({
  config,
  isExpanded,
  isDimmed,
  onCardPress,
  onCtaPress,
}) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? COLORS.dark : COLORS.light;

  const expandProgress = useSharedValue(0);
  const dimProgress = useSharedValue(0);
  const ctaOpacity = useSharedValue(0);
  const cardScale = useSharedValue(1);

  useEffect(() => {
    if (isExpanded) {
      expandProgress.value = withSpring(1, SPRING);
      cardScale.value = withSpring(1, SPRING);
      dimProgress.value = withTiming(0, { duration: 420 });
      ctaOpacity.value = withDelay(220, withTiming(1, { duration: 240 }));
    } else {
      expandProgress.value = withSpring(0, SPRING);
      ctaOpacity.value = withTiming(0, { duration: 150 });
    }
  }, [isExpanded]);

  useEffect(() => {
    if (isDimmed) {
      dimProgress.value = withTiming(1, { duration: 420 });
      cardScale.value = withSpring(0.965, SOFT_SPRING);
    } else {
      dimProgress.value = withTiming(0, { duration: 420 });
      cardScale.value = withSpring(1, SOFT_SPRING);
    }
  }, [isDimmed]);

  const cardContainerStyle = useAnimatedStyle(() => ({
    height: interpolate(
      expandProgress.value,
      [0, 1],
      [CARD_COLLAPSED_HEIGHT, CARD_EXPANDED_HEIGHT],
      Extrapolation.CLAMP,
    ),
    opacity: interpolate(dimProgress.value, [0, 1], [1, 0.45]),
    transform: [{ scale: cardScale.value }],
  }));

  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: interpolate(ctaOpacity.value, [0, 1], [12, 0]) }],
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(${hexToRgb(config.accent.primary)}, ${interpolate(
      expandProgress.value,
      [0, 1],
      [0.25, 0.75],
    )})`,
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expandProgress.value, [0, 1], [0, 1]),
  }));

  const handleCardPress = useCallback(() => onCardPress(config.id), [config.id, onCardPress]);
  const handleCtaPress = useCallback(() => onCtaPress(config.id), [config.id, onCtaPress]);

  const iconBadgeBg = isDark
    ? `${config.accent.primary}18`
    : `${config.accent.primary}14`;

  const iconBadgeBorder = isDark
    ? `${config.accent.primary}40`
    : `${config.accent.primary}55`;

  return (
    <Animated.View style={[styles.cardOuter, cardContainerStyle]}>
      <Animated.View style={[styles.cardBorder, borderStyle]}>

        {/* Blur + tint stack — isolated so its hooks don't bleed into parent */}
        <CardBackground
          isDark={isDark}
          accentStart={config.accent.gradientStart}
        />

        {/* Top shimmer line that lights up on expand */}
        <Animated.View style={[styles.shimmerLine, shimmerStyle]} pointerEvents="none">
          <LinearGradient
            colors={['transparent', config.accent.primary, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Pressable
          style={styles.cardHeader}
          onPress={handleCardPress}
          android_ripple={{ color: `${config.accent.primary}22` }}
        >
          <View style={[styles.iconBadge, { backgroundColor: iconBadgeBg, borderColor: iconBadgeBorder }]}>
            <CardIcon id={config.id} color={config.accent.primary} />
          </View>

          <View style={styles.textGroup}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              {config.title}
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
              {config.subtitle}
            </Text>
          </View>

          <AnimatedChevron expandProgress={expandProgress} color={config.accent.primary} />
        </Pressable>

        <AnimatedDivider
          expandProgress={expandProgress}
          color={config.accent.primary}
          isDark={isDark}
        />

        <Animated.View style={[styles.ctaSection, ctaStyle]}>
          <View style={styles.pillRow}>
            {config.featurePills.map((pill) => (
              <View
                key={pill}
                style={[
                  styles.pill,
                  {
                    borderColor: `${config.accent.primary}${isDark ? '40' : '60'}`,
                    backgroundColor: `${config.accent.primary}0D`,
                  },
                ]}
              >
                <Text style={[styles.pillText, { color: config.accent.primary }]}>{pill}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.ctaButtonWrapper} onPress={handleCtaPress} activeOpacity={0.82}>
            <LinearGradient
              colors={[config.accent.primary, config.accent.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaButton}
            >
              <Text style={styles.ctaLabel}>{config.ctaLabel}</Text>
              <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.9)" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
};

const CardBackground: React.FC<{
  isDark: boolean;
  accentStart: string;
}> = ({ isDark, accentStart }) => (
  <>
    <BlurView
      style={StyleSheet.absoluteFill}
      blurType={isDark ? 'dark' : 'light'}
      blurAmount={18}
    />
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: isDark
            ? `${accentStart}99`
            : 'rgba(255, 255, 255, 0.45)',
        },
      ]}
    />
  </>
);

const CardIcon: React.FC<{ id: WalletType; color: string }> = ({ id, color }) => {
  if (id === 'lazorkit') {
    return <MaterialCommunityIcons name="key-wireless" size={26} color={color} />;
  }
  return <MaterialCommunityIcons name="wallet-outline" size={26} color={color} />;
};

const AnimatedDivider: React.FC<{
  expandProgress: Animated.SharedValue<number>;
  color: string;
  isDark: boolean;
}> = ({ expandProgress, color, isDark }) => {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(expandProgress.value, [0, 0.5, 1], [0, 0, 1]),
  }));
  return (
    <Animated.View style={[styles.divider, style]}>
      <LinearGradient
        colors={['transparent', isDark ? `${color}55` : `${color}80`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
};

const AnimatedChevron: React.FC<{
  expandProgress: Animated.SharedValue<number>;
  color: string;
}> = ({ expandProgress, color }) => {
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(expandProgress.value, [0, 1], [0, 180])}deg` }],
  }));
  return (
    <Animated.View style={style}>
      <Ionicons name="chevron-down" size={20} color={color} />
    </Animated.View>
  );
};

function hexToRgb(hex: string): string {
  'worklet';
  const c = hex.replace('#', '');
  return `${parseInt(c.slice(0, 2), 16)}, ${parseInt(c.slice(2, 4), 16)}, ${parseInt(c.slice(4, 6), 16)}`;
}

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  cardBorder: {
    flex: 1,
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
  },
  shimmerLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: CARD_COLLAPSED_HEIGHT,
    gap: 16,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textGroup: {
    flex: 1,
    gap: 5,
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: 'DankMono-Bold',
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 13,
    fontFamily: 'DankMono',
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  divider: {
    height: 1,
    marginHorizontal: 20,
  },
  ctaSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 14,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 9999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 11,
    fontFamily: 'DankMono-Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  ctaButtonWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  ctaButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
  },
  ctaLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'DankMono-Bold',
    letterSpacing: 0.2,
  },
});