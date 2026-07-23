import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, useColorScheme } from 'react-native';
import MediaPreview from './MediaPreview';
import GetApiUrl from '@/src/utils/url_api';
import { chatColors, chatRadius } from '@/src/theme/chatTheme';

interface MediaItem {
  id: number;
  file_url: string | null;
}

interface MediaGridProps {
  media: MediaItem[];
}

const GRID_SPACING = 2;

export default function MediaGrid({ media }: MediaGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  const isDark = useColorScheme() === 'dark';
  const colors = chatColors[isDark ? 'dark' : 'light'];

  const maxContentWidth = Math.min(screenWidth * 0.82, 420) - 24;

  const getGridLayout = () => {
    switch (media.length) {
      case 1:
        return styles.singleContainer;
      case 2:
        return styles.doubleContainer;
      case 3:
        return styles.tripleContainer;
      case 4:
        return styles.quadContainer;
      default:
        return styles.manyContainer;
    }
  };

  const getMediaSize = (index: number) => {
    const baseWidth = maxContentWidth;
    const aspectRatio = 3 / 4;

    switch (media.length) {
      case 1:
        return {
          width: baseWidth,
          height: baseWidth * aspectRatio,
          borderRadius: chatRadius.card,
        };
      case 2:
        return {
          width: (baseWidth - GRID_SPACING) / 2,
          height: ((baseWidth - GRID_SPACING) / 2) * aspectRatio,
          borderRadius: chatRadius.card / 2,
        };
      case 3:
        if (index === 0) {
          return {
            width: baseWidth,
            height: baseWidth * aspectRatio * 0.7,
            borderRadius: chatRadius.card / 2,
          };
        }
        return {
          width: (baseWidth - GRID_SPACING) / 2,
          height: ((baseWidth - GRID_SPACING) / 2) * aspectRatio,
          borderRadius: chatRadius.card / 2,
        };
      case 4:
        return {
          width: (baseWidth - GRID_SPACING) / 2,
          height: ((baseWidth - GRID_SPACING) / 2) * aspectRatio,
          borderRadius: chatRadius.card / 2,
        };
      default:
        if (index === 0) {
          return {
            width: baseWidth,
            height: baseWidth * aspectRatio * 0.7,
            borderRadius: chatRadius.card / 2,
          };
        }
        return {
          width: (baseWidth - GRID_SPACING * 2) / 3,
          height: ((baseWidth - GRID_SPACING * 2) / 3) * aspectRatio,
          borderRadius: chatRadius.card / 3,
        };
    }
  };

  return (
    <View style={[styles.container, { width: maxContentWidth }, getGridLayout()]}>
      {media.slice(0, 6).map((item, index) => {
        const size = getMediaSize(index);
        return (
          <View
            key={item.id || index}
            style={[
              styles.mediaWrapper,
              size,
              index > 0 && styles.mediaSpacing,
            ]}
          >
            <MediaPreview
              uri={
                item.file_url?.startsWith('/media/')
                  ? `${GetApiUrl().slice(0, 25)}${item.file_url}`
                  : item.file_url || ''
              }
              type={item.file_url?.includes('.mp4') ? 'video' : 'image'}
              customSize={size}
            />
            {media.length > 6 && index === 5 && (
              <View style={[styles.remainingCount, { borderRadius: size.borderRadius }]}>
                <Text style={styles.remainingText}>+{media.length - 6}</Text>
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
    overflow: 'hidden',
    borderRadius: chatRadius.card,
    marginBottom: 8,
  },
  singleContainer: {},
  doubleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tripleContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_SPACING,
  },
  quadContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_SPACING,
  },
  manyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_SPACING,
  },
  mediaWrapper: {
    overflow: 'hidden',
  },
  mediaSpacing: {
    marginTop: GRID_SPACING,
  },
  remainingCount: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  remainingText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
});