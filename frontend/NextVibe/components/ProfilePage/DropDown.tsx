// DropDown.tsx
import { View, useColorScheme, Text, TouchableOpacity, StyleSheet, Animated, Modal } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient';
import { useState, useEffect, useRef } from "react";
import deletePost from "@/src/api/delete.post";

// Web3 Toast Component
function Web3Toast({ message, visible, onHide }: { message: string, visible: boolean, onHide: () => void }) {
  const isDark = useColorScheme() === "dark";
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
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

      const timer = setTimeout(() => {
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
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!visible) return null;

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
      <LinearGradient
        colors={['#8B5CF6', '#6366F1', '#EC4899']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.toastBorder}
      />
      <View style={styles.toastContent}>
        <View style={[
          styles.toastIconContainer,
          {
            backgroundColor: isDark ? "#8B5CF620" : "#8B5CF615",
          }
        ]}>
          <MaterialCommunityIcons
            name="check-circle"
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
      </View>
    </Animated.View>
  );
}

// Confirmation Dialog
function ConfirmDialog({ 
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

export default function DropDown({
  isVisible,
  isOwner,
  postId,
  onClose,
  onPostDeleted
}: {
  isVisible: boolean,
  isOwner: boolean,
  postId: number,
  onClose: () => void,
  onPostDeleted?: () => void
}) {
  const isDark = useColorScheme() === "dark";
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isVisible) {
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
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isVisible]);

  const handleDeleteClick = () => {
    onClose();
    setTimeout(() => {
      setShowConfirm(true);
    }, 200);
  };

  const handleConfirmDelete = async () => {
    setShowConfirm(false);
    
    try {
      const response = await deletePost(postId);
      
      setTimeout(() => {
        setToastMessage(response.data || "Post deleted successfully");
        setToastVisible(true);
        
        setTimeout(() => {
          onPostDeleted?.();
        }, 500);
      }, 200);
    } catch (error) {
      setTimeout(() => {
        setToastMessage("Failed to delete post");
        setToastVisible(true);
      }, 200);
    }
  };

  const items = [
    {
      label: "Report",
      icon: "flag",
      gradient: ["#8B5CF6", "#6366F1"],
      iconColor: "#A78BFA",
      onClick: () => {
        onClose();
      },
      show: true,
    },
    {
      label: "Delete",
      icon: "trash-can",
      gradient: ["#EF4444", "#DC2626"],
      iconColor: "#FCA5A5",
      onClick: handleDeleteClick,
      show: isOwner,
    },
  ].filter(item => item.show);

  if (!isVisible) return (
    <>
      <ConfirmDialog
        visible={showConfirm}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowConfirm(false)}
      />
      <Web3Toast
        message={toastMessage}
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
      />
    </>
  );

  return (
    <>
      <Animated.View 
        style={[
          styles.container,
          {
            backgroundColor: isDark ? "rgba(15, 8, 25, 0.98)" : "rgba(255, 255, 255, 0.98)",
            shadowColor: isDark ? "#8B5CF6" : "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.5 : 0.15,
            shadowRadius: 24,
            elevation: 12,
            opacity: opacityAnim,
            transform: [
              { scale: scaleAnim },
              { translateY: scaleAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0]
              })}
            ]
          }
        ]}
      >
        <View style={styles.glassOverlay} />

        <View style={[
          styles.gradientBorder,
          { opacity: isDark ? 1 : 0.3 }
        ]} />

        {items.map((item, i) => (
          <TouchableOpacity
            key={i}
            activeOpacity={0.7}
            onPress={item.onClick}
            style={[
              styles.item,
              i === items.length - 1 && styles.lastItem
            ]}
          >
            <View style={styles.itemContent}>
              <View style={[
                styles.iconContainer,
                {
                  backgroundColor: isDark
                    ? `${item.gradient[0]}20`
                    : `${item.gradient[0]}15`,
                  shadowColor: item.gradient[0],
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: isDark ? 0.6 : 0.3,
                  shadowRadius: 8,
                }
              ]}>
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={18}
                  color={item.iconColor}
                />
              </View>

              <Text style={[
                styles.label,
                { color: isDark ? "#F3F4F6" : "#1F2937" }
              ]}>
                {item.label}
              </Text>
            </View>

            <View style={[
              styles.hoverLine,
              {
                backgroundColor: item.gradient[0],
                opacity: 0
              }
            ]} />
          </TouchableOpacity>
        ))}

        <LinearGradient
          colors={isDark
            ? ['#8B5CF6', '#6366F1', '#EC4899']
            : ['#A78BFA', '#818CF8', '#F9A8D4']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.accentLine}
        />
      </Animated.View>

      <ConfirmDialog
        visible={showConfirm}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowConfirm(false)}
      />

      <Web3Toast
        message={toastMessage}
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 180,
    borderRadius: 16,
    position: "absolute",
    right: 0,
    top: 30,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.2)",
    zIndex: 999999,
  },
  glassOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  gradientBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#8B5CF6",
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(139, 92, 246, 0.1)",
    position: "relative",
  },
  lastItem: {
    borderBottomWidth: 0,
  },
  itemContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.2)",
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  hoverLine: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  accentLine: {
    height: 2,
    width: "100%",
  },
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