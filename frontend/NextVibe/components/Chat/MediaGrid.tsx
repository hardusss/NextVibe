import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import MediaPreview from './MediaPreview';
import GetApiUrl from '@/src/utils/url_api';

interface MediaItem {
  id: number;
  file_url: string | null;
}

interface MediaGridProps {
  media: MediaItem[];
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_CONTENT_WIDTH = SCREEN_WIDTH * 0.65;
const GRID_SPACING = 2;

export default function MediaGrid({ media }: MediaGridProps) {
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
    const baseWidth = MAX_CONTENT_WIDTH;
    const aspectRatio = 3/4; // Стандартне співвідношення сторін

    switch (media.length) {
      case 1:
        return { 
          width: baseWidth, 
          height: baseWidth * aspectRatio,
          borderRadius: 12
        };
      case 2:
        return { 
          width: (baseWidth - GRID_SPACING) / 2, 
          height: ((baseWidth - GRID_SPACING) / 2) * aspectRatio,
          borderRadius: 8
        };
      case 3:
        if (index === 0) {
          return { 
            width: baseWidth, 
            height: baseWidth * aspectRatio,
            borderRadius: 8
          };
        }
        return { 
          width: (baseWidth - GRID_SPACING) / 2, 
          height: ((baseWidth - GRID_SPACING) / 2) * aspectRatio,
          borderRadius: 8
        };
      case 4:
        return { 
          width: (baseWidth - GRID_SPACING) / 2, 
          height: ((baseWidth - GRID_SPACING) / 2) * aspectRatio,
          borderRadius: 8
        };
      default:
        if (index === 0) {
          return { 
            width: baseWidth, 
            height: baseWidth * aspectRatio,
            borderRadius: 8
          };
        }
        return { 
          width: (baseWidth - GRID_SPACING * 2) / 3, 
          height: ((baseWidth - GRID_SPACING * 2) / 3) * aspectRatio,
          borderRadius: 6
        };
    }
  };

  return (
    <View style={[styles.container, getGridLayout()]}>
      {media.slice(0, 6).map((item, index) => {
        const size = getMediaSize(index);
        return (
          <View 
            key={item.id} 
            style={[
              styles.mediaWrapper,
              size,
              index > 0 && styles.mediaSpacing
            ]}
          >
            <MediaPreview
              uri={item.file_url?.startsWith('/media/') 
                ? `${GetApiUrl().slice(0, 25)}${item.file_url}` 
                : item.file_url || ''}
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
    borderRadius: 12,
    marginBottom: 8,
  },
  singleContainer: {
    width: MAX_CONTENT_WIDTH,
  },
  doubleContainer: {
    width: MAX_CONTENT_WIDTH,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tripleContainer: {
    width: MAX_CONTENT_WIDTH,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_SPACING,
  },
  quadContainer: {
    width: MAX_CONTENT_WIDTH,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_SPACING,
  },
  manyContainer: {
    width: MAX_CONTENT_WIDTH,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_SPACING,
  },
  mediaWrapper: {
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
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
