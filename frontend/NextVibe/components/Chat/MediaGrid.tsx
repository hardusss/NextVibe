import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, useColorScheme } from 'react-native';
import MediaPreview from './MediaPreview';
import GetApiUrl from '@/src/utils/url_api';
import { chatColors, chatRadius } from '@/src/theme/chatTheme';

interface MediaItem {
  id?: number | string;
  file_url?: string | null;
  uri?: string | null;
  preview_url?: string | null;
  type?: string;
  mimeType?: string;
  isTemp?: boolean;
}

interface MediaGridProps {
  media: MediaItem[];
}

const GRID_SPACING = 3;

export default function MediaGrid({ media }: MediaGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  const isDark = useColorScheme() === 'dark';
  const colors = chatColors[isDark ? 'dark' : 'light'];

  if (!media || media.length === 0) return null;

  const maxContentWidth = Math.min(screenWidth * 0.82, 420) - 24;

  const getMediaUrl = (item: MediaItem): string => {
    const rawUrl = item.file_url || item.uri || item.preview_url || '';
    if (!rawUrl) return '';
    if (rawUrl.startsWith('/media/')) {
      const base = GetApiUrl();
      const origin = base.includes('/api') ? base.split('/api')[0] : base;
      return `${origin}${rawUrl}`;
    }
    return rawUrl;
  };

  const isVideoItem = (item: MediaItem): boolean => {
    const url = getMediaUrl(item).toLowerCase();
    const itemType = (item.type || item.mimeType || '').toLowerCase();
    return (
      itemType.startsWith('video') ||
      url.endsWith('.mp4') ||
      url.endsWith('.mov') ||
      url.endsWith('.m4v') ||
      url.endsWith('.webm') ||
      url.startsWith('data:video/')
    );
  };

  const totalCount = media.length;
  // Maximum 9 visible grid slots (if >9, slot 9 shows "+X")
  const MAX_VISIBLE = 9;
  const visibleMedia = media.slice(0, MAX_VISIBLE);
  const remainingCount = totalCount > MAX_VISIBLE ? totalCount - MAX_VISIBLE : 0;

  const getMediaSize = (index: number) => {
    const baseWidth = maxContentWidth;

    switch (totalCount) {
      case 1:
        return {
          width: baseWidth,
          height: baseWidth * 0.72,
          borderRadius: chatRadius.card,
        };
      case 2:
        return {
          width: (baseWidth - GRID_SPACING) / 2,
          height: (baseWidth - GRID_SPACING) / 2,
          borderRadius: chatRadius.card / 1.5,
        };
      case 3:
        if (index === 0) {
          return {
            width: baseWidth,
            height: baseWidth * 0.52,
            borderRadius: chatRadius.card / 1.5,
          };
        }
        return {
          width: (baseWidth - GRID_SPACING) / 2,
          height: (baseWidth - GRID_SPACING) / 2,
          borderRadius: chatRadius.card / 1.5,
        };
      case 4:
        return {
          width: (baseWidth - GRID_SPACING) / 2,
          height: (baseWidth - GRID_SPACING) / 2,
          borderRadius: chatRadius.card / 1.5,
        };
      case 5:
        if (index < 2) {
          return {
            width: (baseWidth - GRID_SPACING) / 2,
            height: (baseWidth - GRID_SPACING) / 2 * 0.9,
            borderRadius: chatRadius.card / 1.8,
          };
        }
        return {
          width: (baseWidth - GRID_SPACING * 2) / 3,
          height: (baseWidth - GRID_SPACING * 2) / 3,
          borderRadius: chatRadius.card / 2,
        };
      case 6:
        return {
          width: (baseWidth - GRID_SPACING * 2) / 3,
          height: (baseWidth - GRID_SPACING * 2) / 3,
          borderRadius: chatRadius.card / 2,
        };
      case 7:
      case 8:
      case 9:
      default:
        return {
          width: (baseWidth - GRID_SPACING * 2) / 3,
          height: (baseWidth - GRID_SPACING * 2) / 3,
          borderRadius: chatRadius.card / 2.2,
        };
    }
  };

  return (
    <View style={[styles.container, { width: maxContentWidth }]}>
      {visibleMedia.map((item, index) => {
        const size = getMediaSize(index);
        const url = getMediaUrl(item);
        const isVid = isVideoItem(item);
        const isLastSlot = index === visibleMedia.length - 1 && remainingCount > 0;

        return (
          <View
            key={item.id ? String(item.id) : `media-${index}`}
            style={[
              styles.mediaWrapper,
              {
                width: size.width,
                height: size.height,
                borderRadius: size.borderRadius,
              },
            ]}
          >
            <MediaPreview
              uri={url}
              type={isVid ? 'video' : 'image'}
              customSize={size}
              isInGrid={totalCount > 1}
              isTemp={item.isTemp}
              uploadProgress={(item as any).uploadProgress}
            />
            {isLastSlot && (
              <View style={[styles.remainingCountOverlay, { borderRadius: size.borderRadius }]}>
                <Text style={styles.remainingText}>+{remainingCount}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_SPACING,
    overflow: 'hidden',
    borderRadius: chatRadius.card,
    marginBottom: 6,
  },
  mediaWrapper: {
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  remainingCountOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  remainingText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
});