import React, { useState } from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Modal, Dimensions, ActivityIndicator } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import FastImage from 'react-native-fast-image';

interface MediaPreviewProps {
  uri: string;
  type: 'image' | 'video';
  customSize?: { width: number; height: number };
  isInGrid?: boolean;
}

interface OnLoadEvent {
  nativeEvent: {
    width: number;
    height: number;
  };
}

function VideoThumbnail({ uri, size }: { uri: string; size: { width: number; height: number } }) {
  const player = useVideoPlayer(uri, (player) => {
    player.pause();
  });

  return (
    <VideoView
      player={player}
      style={[styles.thumbnail, size]}
      nativeControls={false}
      contentFit="cover"
    />
  );
}

function FullScreenVideo({ uri, isPlaying }: { uri: string; isPlaying: boolean }) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = true;
    if (isPlaying) {
      player.play();
    }
  });

  React.useEffect(() => {
    if (isPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [isPlaying, player]);

  return (
    <VideoView
      player={player}
      style={styles.fullScreenMedia}
      nativeControls={true}
      contentFit="contain"
    />
  );
}

export default function MediaPreview({ uri, type, customSize, isInGrid }: MediaPreviewProps) {
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

  const handleOpenModal = () => {
    setIsFullScreen(true);
    setIsPlaying(true); 
  };

  const handleCloseModal = () => {
    setIsFullScreen(false);
    setIsPlaying(false); 
  };

  const renderThumbnail = () => (
    <TouchableOpacity onPress={handleOpenModal}>
      <View style={[styles.thumbnailContainer, getThumbnailSize()]}>
        {isLoading && (
          <View style={[styles.loadingContainer, getThumbnailSize()]}>
            <ActivityIndicator color="#00CED1" />
          </View>
        )}
        {type === 'image' ? (
          <FastImage
            source={{ uri }}
            style={[styles.thumbnail, getThumbnailSize()]}
            onLoad={(e: OnLoadEvent) => {
              const { width, height } = e.nativeEvent;
              handleLoad(width, height);
            }}
          />
        ) : (
          <View>
            <VideoThumbnail uri={uri} size={getThumbnailSize()} />
            <LinearGradient
              colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.4)']}
              style={styles.videoOverlay}
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
      onRequestClose={handleCloseModal}
    >
      <View style={styles.modalContainer}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleCloseModal}
        >
          <MaterialIcons name="close" size={30} color="white" />
        </TouchableOpacity>
        
        {type === 'image' ? (
          <FastImage
            source={{ 
              uri,
              priority: FastImage.priority.normal,
              cache: FastImage.cacheControl.immutable 
            }}
            style={styles.fullScreenMedia}
            resizeMode={FastImage.resizeMode.contain}
          />
        ) : (
          <FullScreenVideo uri={uri} isPlaying={isPlaying} />
        )}
      </View>
    </Modal>
  );

  return (
    <>
      {renderThumbnail()}
      {renderFullScreen()}
    </>
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
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
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