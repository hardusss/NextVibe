export type WallpaperType = 'default' | 'preset' | 'color' | 'gradient' | 'custom';
export type BubbleStyle = 'glass' | 'modern' | 'classic' | 'minimal';

export interface WallpaperItem {
  id: string;
  name: string;
  type: WallpaperType;
  value: string; // Hex color, gradient colors separated by comma, or image URI/URL
  colors?: string[];
  thumbnail?: string;
  category: 'preset' | 'gradient' | 'solid';
  accent?: string;
  bubbleMine?: string;
}

export const WALLPAPER_PRESETS: WallpaperItem[] = [
  {
    id: 'aurora_night',
    name: 'Aurora Night',
    type: 'gradient',
    value: '#0f051d,#160b36,#052028',
    colors: ['#0f051d', '#160b36', '#052028'],
    category: 'gradient',
    accent: '#A78BFA',
    bubbleMine: '#8B5CF6',
  },
  {
    id: 'cyber_neon',
    name: 'Cyber Neon',
    type: 'gradient',
    value: '#060919,#18032e,#042230',
    colors: ['#060919', '#18032e', '#042230'],
    category: 'gradient',
    accent: '#06B6D4',
    bubbleMine: '#0891B2',
  },
  {
    id: 'deep_cosmic',
    name: 'Deep Cosmic',
    type: 'preset',
    value: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=90&w=1920&auto=format&fit=crop',
    thumbnail: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=90&w=600&auto=format&fit=crop',
    category: 'preset',
    accent: '#818CF8',
    bubbleMine: '#6366F1',
  },
  {
    id: 'abstract_fluid',
    name: 'Liquid Waves',
    type: 'preset',
    value: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=90&w=1920&auto=format&fit=crop',
    thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=90&w=600&auto=format&fit=crop',
    category: 'preset',
    accent: '#F472B6',
    bubbleMine: '#DB2777',
  },
  {
    id: 'neon_grid',
    name: 'Cyberpunk Grid',
    type: 'preset',
    value: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=90&w=1920&auto=format&fit=crop',
    thumbnail: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=90&w=600&auto=format&fit=crop',
    category: 'preset',
    accent: '#00F0FF',
    bubbleMine: '#0099FF',
  },
  {
    id: 'misty_mountains',
    name: 'Misty Peak',
    type: 'preset',
    value: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=90&w=1920&auto=format&fit=crop',
    thumbnail: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=90&w=600&auto=format&fit=crop',
    category: 'preset',
    accent: '#38BDF8',
    bubbleMine: '#0284C7',
  },
  {
    id: 'neon_aurora',
    name: 'Neon Sky',
    type: 'preset',
    value: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=90&w=1920&auto=format&fit=crop',
    thumbnail: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=90&w=600&auto=format&fit=crop',
    category: 'preset',
    accent: '#C084FC',
    bubbleMine: '#9333EA',
  },
  {
    id: 'minimal_dark',
    name: 'Dark Geometry',
    type: 'preset',
    value: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=90&w=1920&auto=format&fit=crop',
    thumbnail: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=90&w=600&auto=format&fit=crop',
    category: 'preset',
    accent: '#38BDF8',
    bubbleMine: '#0284C7',
  },
  {
    id: 'emerald_glow',
    name: 'Emerald Vibe',
    type: 'gradient',
    value: '#021814,#042b23,#021a16',
    colors: ['#021814', '#042b23', '#021a16'],
    category: 'gradient',
    accent: '#10B981',
    bubbleMine: '#059669',
  },
  {
    id: 'sunset_vibe',
    name: 'Sunset Glow',
    type: 'gradient',
    value: '#260a1d,#3b0c2a,#1c0524',
    colors: ['#260a1d', '#3b0c2a', '#1c0524'],
    category: 'gradient',
    accent: '#F43F5E',
    bubbleMine: '#E11D48',
  },
  {
    id: 'midnight_slate',
    name: 'Midnight Slate',
    type: 'color',
    value: '#0f111a',
    colors: ['#0f111a'],
    category: 'solid',
    accent: '#A78BFA',
    bubbleMine: '#8B5CF6',
  },
  {
    id: 'deep_obsidian',
    name: 'Deep Obsidian',
    type: 'color',
    value: '#07050a',
    colors: ['#07050a'],
    category: 'solid',
    accent: '#A78BFA',
    bubbleMine: '#8B5CF6',
  },
  {
    id: 'royal_violet',
    name: 'Royal Violet',
    type: 'color',
    value: '#170c2e',
    colors: ['#170c2e'],
    category: 'solid',
    accent: '#A78BFA',
    bubbleMine: '#8B5CF6',
  },
  {
    id: 'deep_ocean',
    name: 'Deep Ocean',
    type: 'color',
    value: '#081726',
    colors: ['#081726'],
    category: 'solid',
    accent: '#38BDF8',
    bubbleMine: '#0284C7',
  },
];

export const BUBBLE_STYLES: { id: BubbleStyle; name: string; description: string }[] = [
  { id: 'glass', name: 'Glassmorphism', description: 'Translucent glass effect with soft blur' },
  { id: 'modern', name: 'Modern Rounded', description: 'Sleek solid background with gentle gradients' },
  { id: 'classic', name: 'Classic Chat', description: 'High contrast traditional bubbles' },
  { id: 'minimal', name: 'Minimal Border', description: 'Subtle borders with translucent tint' },
];

export function getWallpaperColors(type: WallpaperType, value: string, isDark: boolean = true) {
  const defaultColors = {
    accent: isDark ? '#A78BFA' : '#7C3AED',
    bubbleMine: isDark ? '#8B5CF6' : '#5856D6',
    inputBorder: isDark ? 'rgba(167, 139, 250, 0.35)' : 'rgba(124, 58, 237, 0.25)',
  };

  if (type === 'default' || !value) {
    return defaultColors;
  }

  // Check preset match
  const matchedPreset = WALLPAPER_PRESETS.find((p) => p.value === value || p.id === value);
  if (matchedPreset && matchedPreset.accent && matchedPreset.bubbleMine) {
    return {
      accent: matchedPreset.accent,
      bubbleMine: matchedPreset.bubbleMine,
      inputBorder: `${matchedPreset.accent}55`,
    };
  }

  // Heuristic color matching for custom gradients or solid hex colors
  const valLower = value.toLowerCase();
  
  // Emerald / Green check
  if (valLower.includes('021814') || valLower.includes('042b23') || valLower.includes('green') || valLower.includes('emerald')) {
    return {
      accent: '#10B981',
      bubbleMine: '#059669',
      inputBorder: 'rgba(16, 185, 129, 0.4)',
    };
  }

  // Sunset / Rose / Pink check
  if (valLower.includes('260a1d') || valLower.includes('3b0c2a') || valLower.includes('rose') || valLower.includes('pink')) {
    return {
      accent: '#F43F5E',
      bubbleMine: '#E11D48',
      inputBorder: 'rgba(244, 63, 94, 0.4)',
    };
  }

  // Ocean / Cyan check
  if (valLower.includes('081726') || valLower.includes('060919') || valLower.includes('ocean') || valLower.includes('cyan')) {
    return {
      accent: '#06B6D4',
      bubbleMine: '#0891B2',
      inputBorder: 'rgba(6, 182, 212, 0.4)',
    };
  }

  return defaultColors;
}
