import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  useColorScheme,
  TextInput,
  Linking,
  Vibration
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator } from "../CustomActivityIndicator";
import { connect2FA, auth } from "@/src/api/2fa";
import GetApiUrl from "@/src/utils/url_api";
import LottieView from "lottie-react-native";
import FastImage from 'react-native-fast-image';

interface Props {
  isVisible: boolean;
  onClose: () => void;
  onFail: () => void;
  onSuccess: () => void;
}

const BottomSheet = ({ isVisible, onClose, onFail, onSuccess }: Props) => {
  const translateY = useRef(new Animated.Value(300)).current;
  const colorScheme = useColorScheme();

  const inputs = useRef<Array<TextInput | null>>([]);
  const inputAnimations = useRef<Array<Animated.Value>>(
    Array.from({ length: 6 }, () => new Animated.Value(1))
  ).current;
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [enterCode, setEnterCode] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: isVisible ? 0 : 300,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isVisible]);

  useEffect(() => {
    const fetchData = async () => {
      const response = await connect2FA();
      setQrUrl(`${response.data.qrcode}`);
      setQrValue(response.data.code);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (isValid) {
      onSuccess();
    }
  }, [isValid]);

  const handleCopy = () => {
    if (qrValue) {
      Clipboard.setString(qrValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const playStoreUrl =
      "https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2";
    Linking.openURL(playStoreUrl);
  };

  const handleBack = () => {
    setEnterCode(false);
  };

  const handleNext = () => {
    setEnterCode(true);
  };

  const handleChange = (text: string, index: number) => {
    const newCode = [...code];
    const characters = text.split("");

    characters.forEach((char, charIndex) => {
      if (index + charIndex < code.length) {
        newCode[index + charIndex] = char;
      }
    });

    setCode(newCode);

    const nextIndex = Math.min(index + characters.length, code.length - 1);
    if (inputs.current[nextIndex]) {
      inputs.current[nextIndex].focus();
    }
    if (newCode.join("").length === 6) {
      verifyCode(newCode.join(""));
      if (!isValid) {
        Vibration.vibrate();
        setCode(["", "", "", "", "", ""]);
        inputs.current[0]?.focus();
        onFail();
        };
    }
    if (text === "") {
    newCode[index] = "";
    setCode(newCode);
    setIsValid(null);
    
    // Move to previous input
    if (index > 0) {
      requestAnimationFrame(() => {
        inputs.current[index - 1]?.focus();
      });
    }
    return;
  }
  };

  const cleanupAndClose = () => {
    // Reset all states
    setCode(["", "", "", "", "", ""]);
    setIsValid(null);
    setQrUrl(null);
    setQrValue(null);
    setEnterCode(false);
    
    // Call success callback and close
    onSuccess();
    onClose();
  };

  const verifyCode = async (code: string) => {
    const result = await auth(code);
    setIsValid(result);
    
    if (result) {
      // On successful auth
      setTimeout(cleanupAndClose, 1000);
    } else {
      // On failed auth
      Vibration.vibrate();
      setTimeout(() => {
        setCode(["", "", "", "", "", ""]);
        setIsValid(null);
        inputs.current[0]?.focus();
      }, 500);
      onFail();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === "Backspace") {
      setIsValid(null);
      if (index === 0 && code[index] === "") return;

      const newCode = [...code];
      newCode[index] = "";
      setCode(newCode);

      if (index > 0) {
        setTimeout(() => {
          inputs.current[index - 1]?.focus();
        }, 50);
      }
    }
  };

  const isDarkMode = colorScheme === "dark";
  const styles = getStyles(isDarkMode);

  if (!isVisible) return null;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} style={styles.overlayTouchable} onPress={onClose} activeOpacity={1} />
      <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} style={styles.closeButton} onPress={onClose}>
          <View style={styles.closeButtonInner}>
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </View>
        </TouchableOpacity>

        <View style={styles.progressContainer}>
          <View style={[styles.progressDot, !enterCode && styles.progressDotActive]} />
          <View style={[styles.progressLine, enterCode && styles.progressLineActive]} />
          <View style={[styles.progressDot, enterCode && styles.progressDotActive]} />
        </View>

        {!enterCode ? (
          <>
            <View style={styles.headerSection}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="shield-lock" size={32} color="#A78BFA" />
              </View>
              <Text style={styles.headerTitle}>Setup 2FA</Text>
              <Text style={styles.headerSubtitle}>
                Scan the QR code with Google Authenticator
              </Text>
            </View>

            <View style={styles.qrSection}>
              <View style={styles.qrWrapper}>
                {qrUrl ? (
                  <FastImage
                    source={{
                      uri: qrUrl,
                      priority: FastImage.priority.normal,
                      cache: FastImage.cacheControl.immutable
                    }}
                    style={styles.qrImage}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                ) : (
                  <ActivityIndicator />
                )}
              </View>
            </View>

            <View style={styles.codeSection}>
              <Text style={styles.orText}>Or enter manually</Text>
              <View style={styles.codeBox}>
                <Text style={styles.codeText}>{qrValue || "..."}</Text>
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} style={styles.copyIconButton} onPress={handleCopy}>
                  <MaterialCommunityIcons
                    name={copied ? "check" : "content-copy"}
                    size={20}
                    color={copied ? "#4ade80" : "#A78BFA"}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} style={styles.downloadButton} onPress={handleDownload}>
                <MaterialCommunityIcons 
                  name="google-play" 
                  size={20} 
                  color={isDarkMode ? "#A78BFA" : "#7b05f1ff"} 
                />
                <Text style={styles.downloadButtonText}>Get App</Text>
              </TouchableOpacity>

              <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} style={styles.nextButton} onPress={handleNext}>
                <Text style={styles.nextButtonText}>Continue</Text>
                <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.headerSection}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="shield-check" size={32} color="#A78BFA" />
              </View>
              <Text style={styles.headerTitle}>Enter Code</Text>
              <Text style={styles.headerSubtitle}>
                Enter the 6-digit code from your authenticator app
              </Text>
            </View>

            <LottieView
              source={require("@/assets/lottie/code.json")}
              autoPlay
              loop
              style={styles.lottie}
            />

            <View style={styles.codeInputContainer}>
              {code.map((digit, index) => (
                <Animated.View 
                  key={index} 
                  style={[
                    styles.codeInputWrapper,
                    { transform: [{ scale: inputAnimations[index] }] }
                  ]}
                >
                  <TextInput
                    style={[
                      styles.codeInput,
                      isValid === null ? null : isValid ? styles.validInput : styles.invalidInput,
                      { backgroundColor: isDarkMode ? '#1a1a2e' : '#f5f5f5' }
                    ]}
                    keyboardType="numeric"
                    maxLength={1}
                    value={digit}
                    onChangeText={(text) => handleChange(text, index)}
                    onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                    ref={(el: TextInput | null) => { inputs.current[index] = el }}
                    selectionColor="#A78BFA"
                    placeholderTextColor={isDarkMode ? '#404040' : '#a0a0a0'}
                  />
                  {digit !== "" && (
                    <View style={styles.digitDot} />
                  )}
                </Animated.View>
              ))}
            </View>

            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              onPress={handleBack}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="arrow-left" size={20} color="#A78BFA" />
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          </>
        )}
      </Animated.View>
    </View>
  );
};

const getStyles = (isDarkMode: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      justifyContent: "flex-end",
    },
    overlayTouchable: {
      flex: 1,
    },
    container: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      minHeight: 520,
      backgroundColor: isDarkMode ? "#0A0410" : "#fff",
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      padding: 24,
      paddingTop: 20,
      elevation: 5,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      borderTopWidth: 2,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: isDarkMode ? "#3b0076ff" : "#e0e0e0"
    },
    closeButton: {
      position: "absolute",
      right: 20,
      top: 20,
      zIndex: 10,
    },
    closeButtonInner: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDarkMode ? "#1a1a2e" : "#f5f5f5",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: isDarkMode ? "#3b0076ff" : "#e0e0e0",
    },
    progressContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
      marginTop: 10,
    },
    progressDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: isDarkMode ? "#2a2a3e" : "#e0e0e0",
    },
    progressDotActive: {
      backgroundColor: "#A78BFA",
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    progressLine: {
      width: 60,
      height: 2,
      backgroundColor: isDarkMode ? "#2a2a3e" : "#e0e0e0",
      marginHorizontal: 10,
    },
    progressLineActive: {
      backgroundColor: "#A78BFA",
    },
    headerSection: {
      alignItems: "center",
      marginBottom: 20,
    },
    iconContainer: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: isDarkMode ? "#1a1a2e" : "#f5f5f5",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
      borderWidth: 2,
      borderColor: isDarkMode ? "#3b0076ff" : "#e0e0e0",
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: "bold",
      color: isDarkMode ? "#fff" : "#000",
      marginBottom: 6,
    },
    headerSubtitle: {
      fontSize: 14,
      color: isDarkMode ? "#aaa" : "#666",
      textAlign: "center",
      paddingHorizontal: 20,
    },
    qrSection: {
      alignItems: "center",
      marginVertical: 20,
    },
    qrWrapper: {
      padding: 20,
      backgroundColor: "#fff",
      borderRadius: 20,
      shadowColor: "#A78BFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 15,
      elevation: 8,
    },
    qrImage: {
      width: 160,
      height: 160,
    },
    codeSection: {
      marginTop: 10,
      marginBottom: 20,
    },
    orText: {
      textAlign: "center",
      color: isDarkMode ? "#888" : "#999",
      fontSize: 12,
      marginBottom: 12,
      fontWeight: "500",
    },
    codeBox: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: isDarkMode ? "#1a1a2e" : "#f5f5f5",
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDarkMode ? "#3b0076ff" : "#e0e0e0",
    },
    codeText: {
      fontSize: 16,
      fontWeight: "600",
      color: isDarkMode ? "#A78BFA" : "#7b05f1ff",
      letterSpacing: 2,
    },
    copyIconButton: {
      padding: 8,
    },
    actionButtons: {
      flexDirection: "row",
      gap: 12,
      marginTop: 10,
    },
    downloadButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDarkMode ? "#1a1a2e" : "#f5f5f5",
      padding: 16,
      borderRadius: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: isDarkMode ? "#3b0076ff" : "#e0e0e0",
    },
    downloadButtonText: {
      color: isDarkMode ? "#A78BFA" : "#7b05f1ff",
      fontSize: 16,
      fontWeight: "bold",
    },
    nextButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#A78BFA",
      padding: 16,
      borderRadius: 12,
      gap: 8,
      shadowColor: "#A78BFA",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    nextButtonText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "bold",
    },
    lottie: {
      width: 180,
      height: 180,
      alignSelf: "center",
      marginVertical: 10,
    },
    codeInputContainer: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
      marginTop: 20,
      paddingHorizontal: 10,
    },
    codeInputWrapper: {
      position: "relative",
    },
    codeInput: {
      width: 48,
      height: 58,
      borderWidth: 2,
      borderColor: isDarkMode ? "#3b0076ff" : "#e0e0e0",
      textAlign: "center",
      fontSize: 24,
      fontWeight: "bold",
      color: isDarkMode ? "#c9d1d9" : "#000",
      borderRadius: 12,
      shadowColor: "#A78BFA",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    digitDot: {
      position: "absolute",
      bottom: 12,
      left: "50%",
      marginLeft: -4,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#A78BFA",
    },
    validInput: {
      borderColor: "#4ade80",
      shadowColor: "#4ade80",
      shadowOpacity: 0.4,
    },
    invalidInput: {
      borderColor: "#FF3B30",
      shadowColor: "#FF3B30",
      shadowOpacity: 0.4,
    },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 30,
      padding: 16,
      borderRadius: 12,
      backgroundColor: isDarkMode ? "#1a1a2e" : "#f5f5f5",
      borderWidth: 2,
      borderColor: "#A78BFA",
    },
    backButtonText: {
      color: "#A78BFA",
      fontSize: 16,
      fontWeight: "bold",
    },
  });

export default BottomSheet;