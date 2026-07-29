import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Dimensions, ActivityIndicator } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { PlayCircle, X } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as VideoThumbnails from 'expo-video-thumbnails';

interface MediaPreviewProps {
  uri: string;
  type?: 'image' | 'video';
  customSize?: { width: number; height: number; borderRadius?: number };
  isInGrid?: boolean;
  isTemp?: boolean;
  uploadProgress?: number;
}

interface OnLoadEvent {
  source: {
    width: number;
    height: number;
  };
}

export default function MediaPreview({ uri, type, customSize, isInGrid, isTemp, uploadProgress }: MediaPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);

  // Auto-detect video type if not explicitly provided
  const isVideo = type === 'video' || (
    uri && (
      uri.toLowerCase().includes('.mp4') ||
      uri.toLowerCase().includes('.mov') ||
      uri.toLowerCase().includes('.m4v') ||
      uri.toLowerCase().includes('.webm') ||
      uri.startsWith('data:video/')
    )
  );

  const fullScreenPlayer = isVideo && uri ? useVideoPlayer(uri, (player) => {
    player.loop = true;
  }) : null;

  React.useEffect(() => {
    if (isFullScreen && isPlaying && isVideo && fullScreenPlayer) {
      fullScreenPlayer.play();
    } else if (fullScreenPlayer) {
      fullScreenPlayer.pause();
    }
  }, [isFullScreen, isPlaying, isVideo, fullScreenPlayer]);

  React.useEffect(() => {
    if (isVideo && uri) {
      setIsLoading(true);
      (async () => {
        try {
          const { uri: generatedUri } = await VideoThumbnails.getThumbnailAsync(
            uri,
            { time: 1000 }
          );
          setThumbnailUri(generatedUri);
        } catch (e) {
          // Thumbnail fallback
        } finally {
          setIsLoading(false);
        }
      })();
    }
  }, [uri, isVideo]);

  const handleLoad = (width: number, height: number) => {
    setIsLoading(false);
    if (width > 0 && height > 0) {
      const ratio = width / height;
      // Clamp aspect ratio between 0.6 (portrait) and 1.8 (landscape)
      const clampedRatio = Math.max(0.6, Math.min(1.8, ratio));
      setAspectRatio(clampedRatio);
    }
  };

  const getThumbnailSize = () => {
    if (customSize) {
      return customSize;
    }
    const screenWidth = Dimensions.get('window').width;
    const maxWidth = Math.min(screenWidth * 0.75, 320);
    const activeRatio = aspectRatio || (4 / 3);
    const calculatedHeight = Math.min(Math.max(maxWidth / activeRatio, 150), 340);

    return {
      width: maxWidth,
      height: calculatedHeight,
      borderRadius: 12,
    };
  };

  const handleOpenModal = () => {
    setIsFullScreen(true);
    setIsPlaying(true);
  };

  const handleCloseModal = () => {
    setIsFullScreen(false);
    setIsPlaying(false);
  };

  const size = getThumbnailSize();

  const renderThumbnail = () => (
    <TouchableOpacity
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      onPress={handleOpenModal}
      activeOpacity={0.9}
    >
      <View
        style={{
          width: size.width,
          height: size.height,
          borderRadius: size.borderRadius || 12,
          overflow: 'hidden',
          backgroundColor: '#15151e',
        }}
      >
        {!isVideo ? (
          <>
            {isLoading && (
              <View style={[StyleSheet.absoluteFill, styles.loadingContainer]}>
                <ActivityIndicator color="#a78bfa" />
              </View>
            )}
            <Image
              source={{ uri }}
              style={{
                width: size.width,
                height: size.height,
              }}
              contentFit="cover"
              transition={200}
              onLoad={(e: OnLoadEvent) => {
                const { width, height } = e.source;
                handleLoad(width, height);
              }}
              onError={() => setIsLoading(false)}
            />
          </>
        ) : (
          <>
            {isLoading && !thumbnailUri && (
              <View style={[StyleSheet.absoluteFill, styles.loadingContainer]}>
                <ActivityIndicator color="#a78bfa" />
              </View>
            )}

            <Image
              source={{ uri: thumbnailUri || uri }}
              style={{
                width: size.width,
                height: size.height,
              }}
              contentFit="cover"
              transition={200}
              onLoad={(e: OnLoadEvent) => {
                const { width, height } = e.source;
                handleLoad(width, height);
              }}
            />

            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <LinearGradient
                colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.45)']}
                style={StyleSheet.absoluteFill}
              >
                <View style={styles.playIconContainer}>
                  <View style={styles.playCircleBackground}>
                    <PlayCircle size={38} color="#ffffff" />
                  </View>
                </View>
              </LinearGradient>
            </View>
          </>
        )}
        {(isTemp || (uploadProgress !== undefined && uploadProgress < 100)) && (
          <View style={[StyleSheet.absoluteFill, styles.uploadProgressOverlay]}>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.uploadProgressText}>
              {uploadProgress !== undefined ? `${Math.round(uploadProgress)}%` : 'Sending...'}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderFullScreen = () => (
    <Modal
      visible={isFullScreen}
      transparent={false}
      animationType="fade"
      onRequestClose={handleCloseModal}
      statusBarTranslucent
    >
      <View style={styles.modalContainer}>
        <TouchableOpacity
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          style={styles.closeButton}
          onPress={handleCloseModal}
          activeOpacity={0.7}
        >
          <View style={styles.closeButtonCircle}>
            <X size={24} color="white" />
          </View>
        </TouchableOpacity>

        {!isVideo ? (
          <Image
            source={{ uri }}
            style={styles.fullScreenMedia}
            contentFit="contain"
          />
        ) : (
          fullScreenPlayer && (
            <VideoView
              player={fullScreenPlayer}
              style={styles.fullScreenMedia}
              contentFit="contain"
              nativeControls={true}
            />
          )
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
  playIconContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playCircleBackground: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 30,
    padding: 6,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenMedia: {
    width: width,
    height: height,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  closeButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30, 30, 40, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#15151e',
  },
  uploadProgressOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  uploadProgressText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
});