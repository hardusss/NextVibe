import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  useColorScheme,
  TextInput,
  Image,
  Linking,
  Vibration
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator } from "../CustomActivityIndicator";
import { connect2FA, auth } from "@/src/api/2fa";
import GetApiUrl from "@/src/utils/url_api";
import LottieView from "lottie-react-native";


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
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [enterCode, setEnterCode] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [isValid, setIsValid] = useState<boolean | null>(null)

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
      setQrUrl(`${GetApiUrl().slice(0, 25)}${response.data.qrcode}`);
      setQrValue(response.data.code);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (isValid) {
      onSuccess();
    }
  }, [isValid])
  const handleCopy = () => {
    if (qrValue) {
      Clipboard.setString(qrValue);
      alert("Copied to clipboard!");
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
      verifyCode(newCode.join(""))
      if (!isValid) {
        Vibration.vibrate()
        setCode(["", "", "", "", "", ""])
        inputs.current[0]?.focus();
        onFail();
      }
    }
  };

  const verifyCode = async (code: string) => {
    setIsValid(await auth(code));
  }

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
      <TouchableOpacity style={styles.overlayTouchable} onPress={onClose} activeOpacity={1} />
      <Animated.View style={[styles.container, { transform: [{ translateY }] }]}> 
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <MaterialCommunityIcons style={styles.closeText} name="close" size={24} />
        </TouchableOpacity>

        {!enterCode ? (
          <>
            <Text style={styles.instruction}>
              Scan this QR code or enter the code manually in the Google Authenticator app.
            </Text>

            <View style={styles.qrContainer}>
              {qrUrl ? (
                <Image source={{ uri: qrUrl }} style={styles.qrImage} />
              ) : (
                <ActivityIndicator />
              )}
            </View>

            <View style={styles.copyContainer}>
              <Text style={styles.qrText}>{qrValue || "..."}</Text>
              <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
                <Text style={styles.copyText}>Copy</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.downloadButton} onPress={handleDownload}>
              <Text style={styles.downloadText}>Download here</Text>
            </TouchableOpacity>  
            <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
              <Text style={styles.nextText}>Next</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={[styles.instruction, {fontSize: 20}]}>Enter code from Auth App</Text>
            <LottieView source={require("@/assets/lottie/code.json")} autoPlay loop style={styles.lottie} />
            <View style={styles.codeContainer}>
              {code.map((digit, index) => (
                <TextInput
                  key={index}
                  style={[styles.codeInput, { borderColor: isValid === null ? "#00E4FF" : isValid ? "green" : "red" }]}
                  keyboardType="numeric"
                  maxLength={1}
                  value={digit}
                  onChangeText={(text) => handleChange(text, index)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                  ref={(el) => (inputs.current[index] = el)}
              />
              ))}
            </View>
            <TouchableOpacity onPress={handleBack} style={[styles.nextButton, {width: "75%", alignSelf: "center", position: "absolute", bottom: 40}]}>
                <Text style={styles.nextText}>Back</Text>
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
      backgroundColor: "rgba(0,0,0,0.5)",
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
      height: 450,
      backgroundColor: isDarkMode ? "black" : "#fff",
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      elevation: 5,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.2,
      shadowRadius: 5,
      borderTopWidth: 2,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: "#00E4FF"
    },
    closeButton: {
      position: "absolute",
      right: 15,
      top: 15,
      zIndex: 10,
    },
    closeText: {
      color: "#00E4FF",
    },
    instruction: {
      fontSize: 14,
      color: isDarkMode ? "#aaa" : "#555",
      textAlign: "center",
      marginBottom: 10,
    },
    qrContainer: {
      alignItems: "center",
      marginBottom: 20,
    },
    qrImage: {
      width: 150,
      height: 150,
    },
    copyContainer: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
    },
    qrText: {
      fontSize: 16,
      color: isDarkMode ? "#fff" : "#000",
      marginRight: 10,
    },
    copyButton: {
      marginLeft: 10,
    },
    copyText: {
      color: "#00E4FF",
      fontSize: 16,
    },
    downloadButton: {
      backgroundColor: "#00E4FF",
      padding: 12,
      borderRadius: 8,
      alignItems: "center",
      marginTop: 15,
    },
    downloadText: {
      color: "#000",
      fontSize: 18,
      fontWeight: "bold",
    },
    nextButton: {
      backgroundColor: "#000",
      borderWidth: 2,
      borderColor: "#00E4FF",
      padding: 12,
      borderRadius: 8,
      alignItems: "center",
      marginTop: 15,
    },
    nextText: {
      color: "#00E4FF",
      fontSize: 18,
      fontWeight: "bold",
    },
    codeContainer: {
      flexDirection: "row",
      justifyContent: "center",
      marginTop: 50,
    },
    codeInput: {
      width: 40,
      height: 40,
      borderWidth: 2,
      borderColor: "#00E4FF",
      textAlign: "center",
      fontSize: 18,
      color: isDarkMode ? "#fff" : "#000",
      marginHorizontal: 5,
      borderRadius: 5,
    },
    valid: {
      borderColor: "green",
    },
    invalid: {
      borderColor: "red",
    },
    lottie: {
      width: 170,
      height: 170,
      alignSelf: "center",
      marginTop: -20
    },
  });

export default BottomSheet;
