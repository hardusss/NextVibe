import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, Dimensions, ActivityIndicator } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import FastImage from 'react-native-fast-image';
// 1. Імпортуємо expo-video-thumbnails
import * as VideoThumbnails from 'expo-video-thumbnails';

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

export default function MediaPreview({ uri, type, customSize, isInGrid }: MediaPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  
  // 2. Додаємо стан для збереження URI згенерованого прев'ю
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);

  // 3. thumbnailPlayer видалено. Він нам більше не потрібен у сітці.
  
  // 4. Створюємо fullScreenPlayer (він буде створений для
  //    кожного елемента, але не буде активним до модального вікна)
  const fullScreenPlayer = type === 'video' ? useVideoPlayer(uri, (player) => {
    player.loop = true;
  }) : null;

  React.useEffect(() => {
    if (isFullScreen && isPlaying && type === 'video' && fullScreenPlayer) {
      fullScreenPlayer.play();
    } else if (fullScreenPlayer) {
      fullScreenPlayer.pause();
    }
  }, [isFullScreen, isPlaying]);

  // 5. Додаємо useEffect для генерації прев'ю
  React.useEffect(() => {
    if (type === 'video') {
      // Встановлюємо isLoading в true для відео, щоб показати лоадер
      setIsLoading(true);
      (async () => {
        try {
          const { uri: generatedUri } = await VideoThumbnails.getThumbnailAsync(
            uri,
            { time: 1000 } // Беремо кадр на 1-й секунді
          );
          setThumbnailUri(generatedUri);
        } catch (e) {
          console.warn('Не вдалося згенерувати прев\'ю для відео:', e);
        } finally {
          setIsLoading(false); // Вимикаємо лоадер у будь-якому випадку
        }
      })();
    }
  }, [uri, type]); // Ефект спрацює, якщо зміниться uri або type

  React.useEffect(() => {
    return () => {
      // 6. Прибираємо thumbnailPlayer з очищення
      if (fullScreenPlayer) {
        fullScreenPlayer.pause();
      }
    };
  }, []); // Залишаємо fullScreenPlayer в залежностях

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
      const aspectRatio = imageSize.width / imageSize.height || 1;
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

  const size = getThumbnailSize();

  const renderThumbnail = () => (
    <TouchableOpacity onPress={handleOpenModal} activeOpacity={0.9}>
      <View style={{
        // @ts-ignore
        width: size.width,
        height: size.height,
        // @ts-ignore
        borderRadius: size.borderRadius || 8, // Беремо borderRadius з customSize, якщо є
        overflow: 'hidden',
        backgroundColor: '#1a1a1a',
      }}>
        
        {/* 7. Повністю змінюємо логіку рендерингу */}
        
        {type === 'image' ? (
          <>
            {isLoading && (
              <View style={[StyleSheet.absoluteFill, styles.loadingContainer]}>
                <ActivityIndicator color="#00CED1" />
              </View>
            )}
            <FastImage
              source={{ uri }}
              style={{
                width: size.width,
                height: size.height,
              }}
              resizeMode={FastImage.resizeMode.cover}
              onLoad={(e: OnLoadEvent) => {
                const { width, height } = e.nativeEvent;
                handleLoad(width, height);
              }}
              onError={() => setIsLoading(false)}
            />
          </>
        ) : (
          // 8. Логіка для ВІДЕО
          <>
            {/* Показуємо лоадер, поки генерується прев'ю */}
            {isLoading && (
              <View style={[StyleSheet.absoluteFill, styles.loadingContainer]}>
                <ActivityIndicator color="#00CED1" />
              </View>
            )}
            
            {/* Коли прев'ю готове (thumbnailUri не null), показуємо FastImage */}
            {thumbnailUri && (
              <FastImage
                source={{ uri: thumbnailUri }}
                style={{
                  width: size.width,
                  height: size.height,
                }}
                resizeMode={FastImage.resizeMode.cover}
              />
            )}
            
            {/* Завжди показуємо оверлей з іконкою Play поверх */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.3)']}
                style={StyleSheet.absoluteFill}
              >
                <View style={styles.playIconContainer}>
                  <MaterialIcons name="play-circle-filled" size={40} color="white" />
                </View>
              </LinearGradient>
            </View>
          </>
        )}
      </View>
    </TouchableOpacity>
  );

  // 9. renderFullScreen() залишається без змін.
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
          style={styles.closeButton}
          onPress={handleCloseModal}
          activeOpacity={0.7}
        >
          <View style={styles.closeButtonCircle}>
            <MaterialIcons name="close" size={24} color="white" />
          </View>
        </TouchableOpacity>
        
        {type === 'image' ? (
          <FastImage
            source={{ 
              uri,
              priority: FastImage.priority.high,
            }}
            style={styles.fullScreenMedia}
            resizeMode={FastImage.resizeMode.contain}
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
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
});