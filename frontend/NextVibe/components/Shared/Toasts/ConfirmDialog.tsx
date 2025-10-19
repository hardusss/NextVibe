import { useColorScheme, Animated, View, Modal, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRef, useEffect } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function ConfirmDialog({ 
  visible, 
  onConfirm, 
  onCancel 
}: { 
  visible: boolean, 
  onConfirm: () => void, 
  onCancel: () => void 
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
            colors={['#EF4444', '#DC2626']}
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
                name="alert-circle"
                size={32}
                color="#FCA5A5"
              />
            </View>

            <Text style={[
              styles.confirmTitle,
              { color: isDark ? "#F3F4F6" : "#1F2937" }
            ]}>
              Delete Post?
            </Text>

            <Text style={[
              styles.confirmMessage,
              { color: isDark ? "#D1D5DB" : "#6B7280" }
            ]}>
              Are you sure you want to delete this post? This action cannot be undone.
            </Text>

            <View style={styles.confirmButtons}>
              <TouchableOpacity
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
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, styles.deleteButton]}
                onPress={onConfirm}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['#EF4444', '#DC2626']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.deleteButtonGradient}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
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
  toastContainer: {
    position: "absolute",
    top: 60,
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
  toastBorder: {
    height: 3,
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
  // Confirm Dialog Styles
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
    borderColor: "rgba(239, 68, 68, 0.3)",
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