import React, { useState } from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Modal, Dimensions, ActivityIndicator } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';

interface MediaPreviewProps {
  uri: string;
  type: 'image' | 'video';
  customSize?: { width: number; height: number };
  style?: any; // Add style prop
  isInGrid?: boolean;
}

export default function MediaPreview({ uri, type, customSize, style, isInGrid }: MediaPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const handleLoad = (width: number, height: number) => {
    setIsLoading(false);
    setImageSize({ width, height });
  };

  const getThumbnailSize = () => {
    if (customSize) {
      return customSize;
    }
    if (!isInGrid) {
      const maxWidth = Dimensions.get('window').width * 0.6;
      const aspectRatio = imageSize.width / imageSize.height;
      const calculatedHeight = maxWidth / aspectRatio;
      return {
        width: maxWidth,
        height: Math.min(calculatedHeight, 200)
      };
    }
    return { width: 150, height: 150 };
  };

  const renderThumbnail = () => (
    <TouchableOpacity onPress={() => setIsFullScreen(true)}>
      <View style={[styles.thumbnailContainer, getThumbnailSize()]}>
        {isLoading && (
          <View style={[styles.loadingContainer, getThumbnailSize()]}>
            <ActivityIndicator color="#00CED1" />
          </View>
        )}
        {type === 'image' ? (
          <Image
            source={{ uri }}
            style={[styles.thumbnail, getThumbnailSize()]}
            onLoad={(e) => {
              const { width, height } = e.nativeEvent.source;
              handleLoad(width, height);
            }}
          />
        ) : (
          <View>
            <Video
              source={{ uri }}
              style={[styles.thumbnail, getThumbnailSize()]}
              resizeMode={"cover" as ResizeMode}
              onLoad={() => setIsLoading(false)}
              shouldPlay={false}
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.gradient}
            >
              <MaterialIcons name="play-circle-filled" size={40} color="white" />
            </LinearGradient>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderFullScreen = () => (
    <Modal
      visible={isFullScreen}
      transparent={false}
      animationType="slide"
    >
      <View style={styles.modalContainer}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => {
            setIsFullScreen(false);
            setIsPlaying(false);
          }}
        >
          <MaterialIcons name="close" size={30} color="white" />
        </TouchableOpacity>
        
        {type === 'image' ? (
          <Image
            source={{ uri }}
            style={styles.fullScreenMedia}
            resizeMode="contain"
          />
        ) : (
          <Video
            source={{ uri }}
            style={styles.fullScreenMedia}
            shouldPlay={isPlaying}
            isLooping
            resizeMode={"contain" as ResizeMode}
            useNativeControls
          />
        )}
      </View>
    </Modal>
  );

  return (
    <View style={customSize}>
      {renderThumbnail()}
      {renderFullScreen()}
    </View>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  thumbnailContainer: {
    margin: 2,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  thumbnail: {
    borderRadius: 8,
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
  },
  fullScreenMedia: {
    width: width,
    height: height,
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
});
