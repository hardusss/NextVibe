import React, { useState, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert, Animated, Easing,  Modal, ScrollView } from "react-native";
import { Camera, useCameraDevice, useCameraFormat } from "react-native-vision-camera";
import Slider from '@react-native-community/slider';
import { MaterialIcons } from "@expo/vector-icons";
import Svg, { Circle, Defs, LinearGradient, Stop, Line } from "react-native-svg";
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useFocusEffect } from "expo-router";


const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const CameraScreen = () => {
  const router = useRouter();
  const [cameraSide, setCameraSide] = useState<"front" | "back">("back");
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [flashOn, setFlashOn] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(30);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedTime, setRecordedTime] = useState<number>(0);
  const [mediaURLS, setMediaURLS] = useState<string[]>([]);
  const [quality, setQuality] = useState<"480p" | "720p" | "1080p">("1080p");
  const [zoom, setZoom] = useState<number>(1);
  const [showFpsModal, setShowFpsModal] = useState<boolean>(false);
  const [showQualityModal, setShowQualityModal] = useState<boolean>(false);
  const [showZoomModal, setShowZoomModal] = useState<boolean>(false); 
  const [bgContainer, setBackgroundContainer] = useState("black");
  let recordInterval = useRef<NodeJS.Timeout | null>(null);
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice(cameraSide);
  const resulutionsSizes = {
    "480p": { width: 720, height: 480 },
    "720p": { width: 1280, height: 720 },
    "1080p": { width: 1920, height: 1080 },
  };
  const format = useCameraFormat(device, [{ videoResolution: resulutionsSizes[quality], photoResolution: resulutionsSizes[quality] }]);
  const progressAnim = useRef(new Animated.Value(0)).current;
  
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
      if (mediaURLS.length === 0){
        return;
      }
      router.push({
        pathname: "/create-post",
        params: {urls: JSON.stringify(mediaURLS)}
      });
  
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

  useFocusEffect(
    useCallback(() => {
      if (cameraSide === "back") {
        setBackgroundContainer("black")
      }   
    }, [cameraSide])
  );
  if (!device) return <Text>Camera not found!</Text>;

  const handleTakePhoto = async () => {
    const photo = await cameraRef.current?.takePhoto({
      flash: flashOn ? "on" : "off",
    });
    setMediaURLS([photo?.path as string]);
  };

  const handleCameraSwitch = () => {
    setCameraSide((prev) => (prev === "back" ? "front" : "back"));
  };

  const handleFpsSelect = (selectedFps: number) => {
    setFps(selectedFps);
    setShowFpsModal(false);
  };

  const handleQualitySelect = (selectedQuality: "480p" | "720p" | "1080p") => {
    setQuality(selectedQuality);
    setShowQualityModal(false);
  };

  const handleZoomChange = (value: number) => {
    setZoom(value);
  };

  const startRecording = async () => {
    if (isRecording) return;

    setIsRecording(true);
    setRecordedTime(0);

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 60000,
      useNativeDriver: false,
      easing: Easing.linear,
    }).start();

    recordInterval.current = setInterval(() => {
      setRecordedTime((prev) => {
        if (prev >= 59) {
          stopRecording();
          return 60;
        }
        return prev + 1;
      });
    }, 1000);

    await cameraRef.current?.startRecording({
      flash: flashOn ? "on" : "off",
      onRecordingFinished: (video) => {
        setMediaURLS((prev) => [...prev, video.path])
      },
      onRecordingError: (error) => {
        Alert.alert("Error", error.message);
      },
    });
  };
  const handleFlash = () => {
    if (cameraSide === "back") {
      setBackgroundContainer("black");
      setFlashOn(!flashOn);
      return;
    }
    setBackgroundContainer(!flashOn ? "white" : "black");
    setFlashOn(!flashOn);
  }
  const stopRecording = async () => {
    if (!isRecording) return;

    setIsRecording(false);
    clearInterval(recordInterval.current!);
    progressAnim.setValue(0);

    await cameraRef.current?.stopRecording();
  };

  const circleRadius = 40;
  const circleCircumference = 2 * Math.PI * circleRadius;

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circleCircumference, 0],
  });

  return (
    <View style={[styles.container, {backgroundColor: bgContainer}]}>
      <StatusBar backgroundColor={"black"} />
      {hasPermission ? (
        <View style={styles.cameraContainer}>
          <TouchableOpacity style={{position: "absolute", left: 10, top: 10, zIndex: 9999}} onPress={() => router.back()}>
            <MaterialIcons name="close" color="white" size={32} />
          </TouchableOpacity>
          <Camera
            ref={cameraRef}
            style={styles.camera}
            format={format}
            device={device}
            isActive={true}
            fps={fps}
            torch={flashOn ? "on" : "off"}
            photo={true}
            video={true}
            photoQualityBalance="quality"
            zoom={zoom} 
          />
        </View>
      ) : (
        <Text>Permission for camera not provided</Text>
      )}

      

      <ScrollView horizontal style={styles.topSettingsRow} >
        <TouchableOpacity
          style={styles.settingButton}
          onPress={() => setShowFpsModal(true)}
        >
          <MaterialIcons name="speed" size={24} color="white" />
          <Text style={styles.settingText}>{fps} FPS</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingButton}
          onPress={() => setShowQualityModal(true)}
        >
          <MaterialIcons name="hd" size={24} color="white" />
          <Text style={styles.settingText}>{quality}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingButton} onPress={() => setShowZoomModal(true)}>
          <MaterialIcons name="zoom-in-map" size={24} color="white" />
          <Text style={styles.settingText}>Zoom</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingButton}
          onPress={() => handleFlash()}
        >
          <MaterialIcons name={flashOn ? "flashlight-on" : "flashlight-off"} size={24} color="white" />
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.workbar}>
        <TouchableOpacity onPress={handleCameraSwitch}>
          <MaterialIcons name="cached" size={50} color={bgContainer === "white" ? "gray" : "white"} />
        </TouchableOpacity>

        <View style={styles.recordButtonContainer}>
          <Svg width="100" height="100" viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id="gradient" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#8A2BE2" stopOpacity="1" />
                <Stop offset="0.33" stopColor="#40E0D0" stopOpacity="1" /> 
                <Stop offset="0.66" stopColor="#FFFFFF" stopOpacity="1" /> 
                <Stop offset="1" stopColor="#0000FF" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Circle
              cx="50"
              cy="50"
              r={circleRadius}
              stroke="rgba(132, 130, 130, 0.7)"
              strokeWidth="5"
              fill="transparent"
            />
            <AnimatedCircle
              cx="50"
              cy="50"
              r={circleRadius}
              stroke="url(#gradient)"
              strokeWidth="5"
              strokeDasharray={circleCircumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              transform="rotate(-90, 50, 50)"
            />
          </Svg>
          <TouchableOpacity
            style={styles.recordButton}
            onPress={handleTakePhoto}
            onLongPress={startRecording}
            onPressOut={stopRecording}
          >
            <MaterialIcons name="camera" size={70} color={bgContainer === "white" ? "gray" : "white"} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={openGallery}>
          <MaterialIcons name="collections" size={50} color={bgContainer === "white" ? "gray" : "white"} />
        </TouchableOpacity>
      </View>

      <Modal visible={showFpsModal} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select FPS</Text>
            {[10, 20, 30].map((value) => (
              <TouchableOpacity key={value} style={styles.modalOption} onPress={() => handleFpsSelect(value)}>
                <Text style={styles.modalOptionText}>{value} FPS</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowFpsModal(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showQualityModal} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Quality</Text>
            {["480p", "720p", "1080p"].map((value) => (
              <TouchableOpacity
                key={value}
                style={styles.modalOption}
                onPress={() => handleQualitySelect(value as "480p" | "720p" | "1080p")}
              >
                <Text style={styles.modalOptionText}>{value}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowQualityModal(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


      <Modal visible={showZoomModal} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Zoom</Text>
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={1}
              maximumValue={5}
              step={0.5}
              value={zoom}
              onValueChange={handleZoomChange}
            />
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowZoomModal(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default CameraScreen;

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center" },
  cameraContainer: {
    width: "95%",
    height: "80%",
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "black",
    marginTop: 60,
    position: "relative"
  },
  camera: { width: "100%", height: "100%"},

  topSettingsRow: {
    position: "absolute",
    top: 0,
    width: "100%",
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,1)",
  },
  settingButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    marginHorizontal: 5,
  },
  settingText: {
    color: "white",
    fontSize: 16,
    marginLeft: 5,
  },
  workbar: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignContent: "center",
    alignItems: "center",
    padding: 20,
  },
  recordButtonContainer: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  recordButton: {
    position: "absolute",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    width: "80%",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "white",
  },
  modalOption: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  modalOptionText: {
    fontSize: 16,
    color: "white",
  },
  modalCloseButton: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#ccc",
    borderRadius: 5,
    alignItems: "center",
  },
  modalCloseButtonText: {
    fontSize: 16,
    color: "black",
  },
});