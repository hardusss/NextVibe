import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  TextInput,
  Linking,
  Vibration,
  Keyboard
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetBackdropProps
} from '@gorhom/bottom-sheet';
import Clipboard from "@react-native-clipboard/clipboard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator } from "../CustomActivityIndicator";
import { connect2FA, auth } from "@/src/api/2fa";
import LottieView from "lottie-react-native";
import FastImage from 'react-native-fast-image';

interface Props {
  isVisible: boolean;
  onClose: () => void;
  onFail: () => void;
  onSuccess: () => void;
}

const darkColors = {
  background: "#130822", // <-- Трохи світліший за #0A0410, щоб не зливався
  textPrimary: "#ffffff",
  textSecondary: "#8b949e",
  border: "#2A1846", // <-- Трохи яскравіший бордер для візуального розділення
  accent: "#05f0d8",
  link: "#a371f7",
  success: "#4ade80",
  danger: "#ff4d4d",
  qrBackground: "#ffffff"
};

const lightColors = {
  background: "#ffffff",
  textPrimary: "#000000",
  textSecondary: "#666666",
  border: "#e5e5e5",
  accent: "#05f0d8",
  link: "#7b05f1",
  success: "#4ade80",
  danger: "#ef4444",
  qrBackground: "#ffffff"
};

const BottomSheet = ({ isVisible, onClose, onFail, onSuccess }: Props) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const colors = isDarkMode ? darkColors : lightColors;
  const styles = getStyles(colors);

  const inputs = useRef<Array<TextInput | null>>([]);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [enterCode, setEnterCode] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isVisible) {
      bottomSheetModalRef.current?.present();
      Keyboard.dismiss();
    } else {
      bottomSheetModalRef.current?.dismiss();
      setEnterCode(false);
      setCode(["", "", "", "", "", ""]);
      setIsValid(null);
    }
  }, [isVisible]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await connect2FA();
        setQrUrl(`${response.data.qrcode}`);
        setQrValue(response.data.code);
      } catch (error) {
        console.error("Failed to load 2FA data", error);
      }
    };
    if (isVisible && !qrUrl) {
      fetchData();
    }
  }, [isVisible]);

  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) {
      onClose();
    }
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={isDarkMode ? 0.7 : 0.4} // У темній темі робимо бекдроп трохи темнішим
      />
    ),
    [isDarkMode]
  );

  const handleCopy = () => {
    if (qrValue) {
      Clipboard.setString(qrValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const playStoreUrl = "https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2";
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
      inputs.current[nextIndex]?.focus();
    }
    
    if (newCode.join("").length === 6) {
      verifyCode(newCode.join(""));
    }
    
    if (text === "") {
      newCode[index] = "";
      setCode(newCode);
      setIsValid(null);
      if (index > 0) {
        requestAnimationFrame(() => {
          inputs.current[index - 1]?.focus();
        });
      }
    }
  };

  const cleanupAndClose = () => {
    setCode(["", "", "", "", "", ""]);
    setIsValid(null);
    setQrUrl(null);
    setQrValue(null);
    setEnterCode(false);
    onSuccess();
    bottomSheetModalRef.current?.dismiss();
  };

  const verifyCode = async (codeString: string) => {
    const result = await auth(codeString);
    setIsValid(result);
    
    if (result) {
      setTimeout(cleanupAndClose, 500);
    } else {
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

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      snapPoints={['75%']}
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.bottomSheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
      enablePanDownToClose={true}
    >
      <BottomSheetView style={styles.contentContainer}>
        {!enterCode ? (
          <View style={styles.viewState}>
            <Text style={styles.title}>Setup 2FA</Text>
            <Text style={styles.subtitle}>Scan the QR code with Google Authenticator</Text>

            <View style={styles.qrSection}>
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

            <View style={styles.codeSection}>
              <Text style={styles.label}>MANUAL CODE</Text>
              <View style={styles.codeRow}>
                <Text style={styles.codeText}>{qrValue || "..."}</Text>
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={handleCopy}>
                  <MaterialCommunityIcons
                    name={copied ? "check" : "content-copy"}
                    size={20}
                    color={copied ? colors.success : colors.link}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.spacer} />

            <TouchableOpacity style={styles.row} onPress={handleDownload}>
              <Text style={styles.rowText}>Get Authenticator App</Text>
              <MaterialCommunityIcons name="google-play" size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.lastRow]} onPress={handleNext}>
              <Text style={styles.linkTextMain}>Continue to Code Entry</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color={colors.link} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.viewState}>
            <Text style={styles.title}>Enter Code</Text>
            <Text style={styles.subtitle}>Enter the 6-digit code from your app</Text>

            <LottieView
              source={require("@/assets/lottie/code.json")}
              autoPlay
              loop
              style={styles.lottie}
            />

            <View style={styles.codeInputContainer}>
              {code.map((digit, index) => (
                <View key={index} style={styles.codeInputWrapper}>
                  <TextInput
                    style={[
                      styles.codeInput,
                      isValid === true && styles.validInput,
                      isValid === false && styles.invalidInput,
                    ]}
                    keyboardType="numeric"
                    maxLength={1}
                    value={digit}
                    onChangeText={(text) => handleChange(text, index)}
                    onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                    ref={(el: TextInput | null) => { inputs.current[index] = el; }}
                    selectionColor={colors.accent}
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              ))}
            </View>

            <View style={styles.spacer} />

            <TouchableOpacity style={[styles.row, styles.lastRow]} onPress={handleBack}>
              <Text style={styles.rowText}>Go Back</Text>
              <MaterialCommunityIcons name="arrow-left" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
};

const getStyles = (colors: any) =>
  StyleSheet.create({
    bottomSheetBackground: {
      backgroundColor: colors.background,
      borderTopWidth: 1, // Додано тонку лінію для чіткої межі
      borderTopColor: colors.border,
    },
    handleIndicator: {
      backgroundColor: colors.border,
      width: 40,
    },
    contentContainer: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 40,
    },
    viewState: {
      flex: 1,
    },
    title: {
      fontSize: 22,
      fontWeight: "600",
      color: colors.textPrimary,
      letterSpacing: 0.5,
      marginBottom: 8,
      textAlign: "center"
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: 32,
      fontWeight: "400"
    },
    qrSection: {
      alignItems: "center",
      marginBottom: 32,
    },
    qrImage: {
      width: 180,
      height: 180,
      backgroundColor: colors.qrBackground,
      borderRadius: 8,
    },
    codeSection: {
      marginBottom: 20,
    },
    label: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.textSecondary,
      letterSpacing: 1.2,
      marginBottom: 8,
    },
    codeRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    codeText: {
      fontSize: 16,
      fontFamily: "Dank Mono Bold", 
      color: colors.textPrimary,
      letterSpacing: 2,
    },
    spacer: {
      flex: 1,
      minHeight: 24,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    lastRow: {
      borderBottomWidth: 0,
    },
    rowText: {
      fontSize: 16,
      color: colors.textPrimary,
      fontWeight: "400",
    },
    linkTextMain: {
      fontSize: 16,
      color: colors.link,
      fontWeight: "500",
    },
    lottie: {
      width: 140,
      height: 140,
      alignSelf: "center",
      marginVertical: 10,
    },
    codeInputContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 10,
      marginTop: 20,
    },
    codeInputWrapper: {
      flex: 1,
      marginHorizontal: 4,
    },
    codeInput: {
      height: 50,
      borderBottomWidth: 2,
      borderBottomColor: colors.border,
      textAlign: "center",
      fontSize: 24,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    validInput: {
      borderBottomColor: colors.success,
      color: colors.success,
    },
    invalidInput: {
      borderBottomColor: colors.danger,
      color: colors.danger,
    },
  });

export default BottomSheet;