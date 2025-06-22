import React, { useState, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert, Animated, Easing, Image, Modal } from "react-native";
import { Camera, useCameraDevice, useCameraFormat } from "react-native-vision-camera";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useFocusEffect } from "expo-router";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const CameraScreen = () => {
  const router = useRouter();
  const [cameraSide, setCameraSide] = useState<"front" | "back">("back");
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('off');
  const [showFlashModal, setShowFlashModal] = useState(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [mediaURLS, setMediaURLS] = useState<string[]>([]);
  const [zoom, setZoom] = useState<number>(1);
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);
  let recordInterval = useRef<NodeJS.Timeout | null>(null);
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice(cameraSide);
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1920, height: 1080 }, photoResolution: { width: 1920, height: 1080 } }
  ]);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const loadLastPhoto = async () => {
    const media = await ImagePicker.getMediaLibraryAsync({ mediaType: ImagePicker.MediaTypeOptions.Images, first: 1 });
    if (media.assets && media.assets.length > 0) {
      setLastPhoto(media.assets[0].uri);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadLastPhoto();
    }, [])
  );

  const openGallery = async () => {
    const image = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      aspect: [4, 3],
      quality: 1,
      allowsMultipleSelection: true,
    });
    image.assets?.forEach(item => {
      setMediaURLS((prev) => [...prev, item.uri])
    })
  };

  useFocusEffect(
    useCallback(() => {
      if (mediaURLS.length === 0) return;
      router.push({ pathname: "/create-post", params: {urls: JSON.stringify(mediaURLS)} });
      setMediaURLS([]);
    }, [mediaURLS])
  );

  useFocusEffect(
    useCallback(() => {
      const requestPermission = async () => {
        const cameraPermission = await Camera.requestCameraPermission();
        setHasPermission(cameraPermission === "granted");
      };
      requestPermission();
    }, [])
  );

  if (!device) return <Text>Camera not found!</Text>;

  const handleTakePhoto = async () => {
    let flash: 'on' | 'off' | undefined = undefined;
    if (flashMode === 'on') flash = 'on';
    if (flashMode === 'off') flash = 'off';
    // For 'auto', let camera decide (undefined)
    const photo = await cameraRef.current?.takePhoto({ flash });
    setMediaURLS([photo?.path as string]);
  };

  const handleCameraSwitch = () => {
    setCameraSide((prev) => (prev === "back" ? "front" : "back"));
  };

  const startRecording = async () => {
    if (isRecording) return;
    setIsRecording(true);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 60000,
      useNativeDriver: false,
      easing: Easing.linear,
    }).start();
    recordInterval.current = setInterval(() => {}, 1000);
    // For 'auto', torch is off by default
    let torch: 'on' | 'off' = 'off';
    if (flashMode === 'on') torch = 'on';
    await cameraRef.current?.startRecording({
      flash: undefined, // not used for video
      onRecordingFinished: (video) => {
        setMediaURLS((prev) => [...prev, video.path])
      },
      onRecordingError: (error) => {
        Alert.alert("Error", error.message);
      },
      ...(torch === 'on' ? { torch: 'on' } : { torch: 'off' })
    });
  };

  const stopRecording = async () => {
    if (!isRecording) return;
    setIsRecording(false);
    progressAnim.setValue(0);
    await cameraRef.current?.stopRecording();
  };

  const circleRadius = 32;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circleCircumference, 0],
  });

  return (
    <View style={[styles.container, { backgroundColor: '#130E1D' }]}> 
      <StatusBar backgroundColor={'#130E1D'} />
      {hasPermission ? (
        <View style={styles.cameraContainer}>
          <Camera
            ref={cameraRef}
            style={styles.camera}
            format={format}
            device={device}
            isActive={true}
            torch={flashMode === 'on' ? 'on' : 'off'}
            photo={true}
            video={true}
            zoom={zoom}
            enableZoomGesture={true}
          />
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="close" color="white" size={28} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.flashButton} onPress={() => setShowFlashModal(true)}>
            <MaterialCommunityIcons 
              name={flashMode === 'on' ? "flash" : flashMode === 'auto' ? "flash-auto" : "flash-off"} 
              size={20} 
              color={flashMode === 'on' ? "#FFD600" : "white"} 
            />
          </TouchableOpacity>
          <Modal visible={showFlashModal} transparent animationType="fade">
            <TouchableOpacity style={styles.flashModalOverlay} activeOpacity={1} onPress={() => setShowFlashModal(false)}>
              <View style={styles.flashModalContentHorizontal}>
                <TouchableOpacity style={styles.flashOption} onPress={() => { setFlashMode('auto'); setShowFlashModal(false); }}>
                  <MaterialCommunityIcons name="flash-auto" size={20} color={flashMode === 'auto' ? '#FFD600' : 'white'} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.flashOption} onPress={() => { setFlashMode('on'); setShowFlashModal(false); }}>
                  <MaterialCommunityIcons name="flash" size={20} color={flashMode === 'on' ? '#FFD600' : 'white'} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.flashOption} onPress={() => { setFlashMode('off'); setShowFlashModal(false); }}>
                  <MaterialCommunityIcons name="flash-off" size={20} color={flashMode === 'off' ? '#FFD600' : 'white'} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
          <View style={styles.bottomControls}>
            <TouchableOpacity style={styles.switchButton} onPress={handleCameraSwitch}>
              <Feather name="refresh-ccw" size={28} color="white" />
            </TouchableOpacity>
            <View style={styles.captureContainer}>
              <Svg width="80" height="80" viewBox="0 0 80 80">
                <Defs>
                  <LinearGradient id="gradient" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor="#8A2BE2" stopOpacity="1" />
                    <Stop offset="0.33" stopColor="#40E0D0" stopOpacity="1" />
                    <Stop offset="0.66" stopColor="#FFFFFF" stopOpacity="1" />
                    <Stop offset="1" stopColor="#0000FF" stopOpacity="1" />
                  </LinearGradient>
                </Defs>
                <Circle
                  cx="40"
                  cy="40"
                  r={32}
                  stroke="rgba(255, 255, 255, 0.3)"
                  strokeWidth="4"
                  fill="transparent"
                />
                <AnimatedCircle
                  cx="40"
                  cy="40"
                  r={32}
                  stroke="url(#gradient)"
                  strokeWidth="4"
                  strokeDasharray={2 * Math.PI * 32}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  transform="rotate(-90, 40, 40)"
                />
              </Svg>
              <TouchableOpacity
                style={styles.captureButton}
                onPress={handleTakePhoto}
                onLongPress={startRecording}
                onPressOut={stopRecording}
              >
                <View style={styles.captureInner} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.galleryButton} onPress={openGallery}>
              {lastPhoto ? (
                <Image source={{ uri: lastPhoto }} style={styles.galleryThumbnail} />
              ) : (
                <MaterialCommunityIcons name="image" size={28} color="white" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={styles.errorText}>Permission for camera not provided</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    backgroundColor: '#130E1D',
  },
  cameraContainer: {
    width: "100%",
    height: "100%",
    backgroundColor: '#130E1D',
    justifyContent: 'flex-end',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  closeButton: {
    position: "absolute",
    left: 20,
    top: 50,
    zIndex: 10
  },
  flashButton: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    padding: 10,
    zIndex: 10
  },
  bottomControls: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    marginBottom: 40,
    zIndex: 10
  },
  switchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  captureContainer: {
    position: 'relative',
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  captureInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'white',
  },
  galleryButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  galleryThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  errorText: {
    color: 'white',
    fontSize: 16,
    marginTop: 20
  },
  flashModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    zIndex: 100,
    justifyContent: 'flex-start',
  },
  flashModalContentHorizontal: {
    flexDirection: 'row',
    backgroundColor: '#1A1A2F',
    borderRadius: 16,
    padding: 10,
    marginTop: 80,
    alignItems: 'center',
    gap: 16,
  },
  flashOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 6,
  },
  flashOptionText: {
    color: 'white',
    fontSize: 18,
    marginLeft: 8,
  }
});

export default CameraScreen;