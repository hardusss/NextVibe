import { useColorScheme, Animated, View, Modal, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRef, useEffect } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function ConfirmDialog({ 
  visible, 
  onConfirm, 
  onCancel,
  title = 'Delete Post?',
  message = 'Are you sure you want to delete this post? This action cannot be undone.',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  confirmGradient = ['#EF4444', '#DC2626'],
  iconName = 'alert-circle',
  iconColor = '#FCA5A5'
}: { 
  visible: boolean, 
  onConfirm: () => void, 
  onCancel: () => void,
  title?: string,
  message?: string,
  confirmLabel?: string,
  cancelLabel?: string,
  confirmGradient?: readonly string[],
  iconName?: string,
  iconColor?: string,
}) {
  const isDark = useColorScheme() === "dark";
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
    >
      <View style={styles.confirmBackdrop}>
        <Animated.View
          style={[
            styles.confirmDialog,
            {
              backgroundColor: isDark ? "rgba(15, 8, 25, 0.98)" : "rgba(255, 255, 255, 0.98)",
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }]
            }
          ]}
        >
          <LinearGradient
            colors={confirmGradient as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.confirmBorder}
          />

          <View style={styles.confirmContent}>
            <View style={[
              styles.confirmIconContainer,
              { backgroundColor: isDark ? "#EF444420" : "#EF444415" }
            ]}>
                <MaterialCommunityIcons
                  name={iconName as any}
                  size={32}
                  color={iconColor}
                />
            </View>

              <Text style={[
                styles.confirmTitle,
                { color: isDark ? "#F3F4F6" : "#1F2937" }
              ]}>
                {title}
              </Text>

              <Text style={[
                styles.confirmMessage,
                { color: isDark ? "#D1D5DB" : "#6B7280" }
              ]}>
                {message}
              </Text>

            <View style={styles.confirmButtons}>
              <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                style={[
                  styles.confirmButton,
                  styles.cancelButton,
                  { backgroundColor: isDark ? "#374151" : "#E5E7EB" }
                ]}
                onPress={onCancel}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.buttonText,
                  { color: isDark ? "#F3F4F6" : "#1F2937" }
                ]}>
                  {cancelLabel}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                style={[styles.confirmButton, styles.deleteButton]}
                onPress={onConfirm}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={confirmGradient as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.deleteButtonGradient}
                >
                  <Text style={styles.deleteButtonText}>{confirmLabel}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  confirmDialog: {
    width: "90%",
    maxWidth: 400,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(98, 16, 232, 0.3)",
  },
  confirmBorder: {
    height: 3,
    width: "100%",
  },
  confirmContent: {
    padding: 24,
    alignItems: "center",
  },
  confirmIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  confirmMessage: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  confirmButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  deleteButton: {
    overflow: "hidden",
  },
  deleteButtonGradient: {
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});