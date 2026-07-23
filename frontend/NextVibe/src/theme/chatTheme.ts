// src/theme/chatTheme.ts

export const chatSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const chatRadius = {
  bubble: 18,
  bubbleTail: 6,   // smaller radius on tail side of last message in group
  card: 16,
  pill: 20,
  modal: 24,
};

export const chatColors = {
  light: {
    bg: '#FAFAFC',
    headerBg: 'rgba(255, 255, 255, 0.92)',
    bubbleMine: '#5856D6',
    bubbleMineText: '#FFFFFF',
    bubbleMineSubtext: 'rgba(255, 255, 255, 0.8)',
    bubbleTheirs: 'rgba(120, 110, 140, 0.08)',
    bubbleTheirsText: '#1A1225',
    bubbleTheirsSubtext: 'rgba(26, 18, 37, 0.65)',
    border: 'rgba(0, 0, 0, 0.08)',
    divider: 'rgba(0, 0, 0, 0.08)',
    inputBg: 'rgba(0, 0, 0, 0.04)',
    accent: '#7C3AED',
    success: '#10B981',
    danger: '#EF4444',
    cardBg: 'rgba(255, 255, 255, 0.95)',
    text: '#1A1225',
    subtext: '#64748B',
    readReceipt: '#38BDF8',
    deliveredReceipt: '#64748B',
    dateBadgeBg: 'rgba(0, 0, 0, 0.05)',
    dateBadgeText: '#64748B',
  },
  dark: {
    bg: '#0A0410',
    headerBg: 'rgba(10, 4, 16, 0.92)',
    bubbleMine: '#8B5CF6',
    bubbleMineText: '#FFFFFF',
    bubbleMineSubtext: 'rgba(255, 255, 255, 0.8)',
    bubbleTheirs: 'rgba(255, 255, 255, 0.08)',
    bubbleTheirsText: '#FFFFFF',
    bubbleTheirsSubtext: 'rgba(255, 255, 255, 0.65)',
    border: 'rgba(255, 255, 255, 0.08)',
    divider: 'rgba(255, 255, 255, 0.1)',
    inputBg: 'rgba(255, 255, 255, 0.06)',
    accent: '#A78BFA',
    success: '#10B981',
    danger: '#EF4444',
    cardBg: 'rgba(21, 7, 35, 0.96)',
    text: '#FFFFFF',
    subtext: '#94A3B8',
    readReceipt: '#38BDF8',
    deliveredReceipt: '#94A3B8',
    dateBadgeBg: 'rgba(255, 255, 255, 0.1)',
    dateBadgeText: '#94A3B8',
  },
};

export const chatTypography = {
  message: { fontSize: 16, lineHeight: 22 },
  time: { fontSize: 11 },
  senderName: { fontSize: 13, fontWeight: '700' as const },
  header: { fontSize: 16, fontWeight: '700' as const },
};
