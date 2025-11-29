import { useColorScheme, Animated, View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRef, useEffect } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function Web3Toast({ message, visible, onHide, isSuccess }: { message: string, visible: boolean, onHide: () => void, isSuccess: boolean }) {
  const isDark = useColorScheme() === "dark";
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      // Reset animations
      progressAnim.setValue(1);

      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Progress bar animation
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: 3000,
        useNativeDriver: false,
      }).start();

      const timer = setTimeout(() => {
        handleClose();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [visible, slideAnim, opacityAnim, progressAnim]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => onHide());
  };

  if (!visible) return null;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
          backgroundColor: isDark ? "rgba(15, 8, 25, 0.98)" : "rgba(255, 255, 255, 0.98)",
          shadowColor: "#8B5CF6",
        },
      ]}
    >
      {/* Animated progress bar */}
      <View style={styles.progressContainer}>
        <Animated.View style={{ width: progressWidth }}>
          <LinearGradient
            colors={['#8B5CF6', '#6366F1', '#EC4899']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.progressBar}
          />
        </Animated.View>
      </View>

      {/* Toast content */}
      <View style={styles.toastContent}>
        <View style={[
          styles.toastIconContainer,
          {
            backgroundColor: isDark ? "#8B5CF620" : "#8B5CF615",
          }
        ]}>
          <MaterialCommunityIcons
            name={isSuccess ? "check-circle" : "information-outline"}
            size={20}
            color="#A78BFA"
          />
        </View>
        <Text style={[
          styles.toastText,
          { color: isDark ? "#F3F4F6" : "#1F2937" }
        ]}>
          {message}
        </Text>
        
        {/* Close button */}
        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
          onPress={handleClose}
          style={styles.closeButton}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="close"
            size={20}
            color={isDark ? "#9CA3AF" : "#6B7280"}
          />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: "absolute",
    top: 10,
    left: 20,
    right: 20,
    zIndex: 999999999,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  progressContainer: {
    height: 3,
    width: "100%",
    backgroundColor: "rgba(139, 92, 246, 0.1)",
  },
  progressBar: {
    height: "100%",
    width: "100%",
  },
  toastContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  toastIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.3)",
  },
  toastText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});