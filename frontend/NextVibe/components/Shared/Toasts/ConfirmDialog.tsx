import { Animated, View, Modal, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRef, useEffect } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { AlertTriangle, X } from "lucide-react-native";

export default function ConfirmDialog({
    visible,
    onConfirm,
    onCancel,
    title = 'Delete Post?',
    message = 'Are you sure you want to delete this post? This action cannot be undone.',
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    confirmGradient = ['#EF4444', '#DC2626'],
    iconName,
    iconColor = '#f87171',
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
    const scaleAnim = useRef(new Animated.Value(0.88)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 120,
                    friction: 9,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 180,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            scaleAnim.setValue(0.88);
            opacityAnim.setValue(0);
        }
    }, [visible]);

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={onCancel}
        >
            {/* Backdrop */}
            <TouchableOpacity
                style={styles.backdrop}
                activeOpacity={1}
                onPress={onCancel}
            />

            {/* Dialog */}
            <View style={styles.center} pointerEvents="box-none">
                <Animated.View style={[
                    styles.dialog,
                    { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }
                ]}>
                    {/* Top gradient line */}
                    <LinearGradient
                        colors={confirmGradient as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.topLine}
                    />

                    {/* Close button */}
                    <TouchableOpacity
                        style={styles.closeBtn}
                        onPress={onCancel}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                        <X size={16} color="rgba(255,255,255,0.4)" strokeWidth={2} />
                    </TouchableOpacity>

                    <View style={styles.content}>
                        {/* Icon */}
                        <View style={[styles.iconRing, { borderColor: `${confirmGradient[0]}40` }]}>
                            <LinearGradient
                                colors={[`${confirmGradient[0]}22`, `${confirmGradient[1]}11`]}
                                style={styles.iconBg}
                            >
                                <AlertTriangle size={28} color={iconColor} strokeWidth={1.8} />
                            </LinearGradient>
                        </View>

                        <Text style={styles.title}>{title}</Text>
                        <Text style={styles.message}>{message}</Text>

                        {/* Buttons */}
                        <View style={styles.buttons}>
                            <TouchableOpacity
                                style={styles.cancelBtn}
                                onPress={onCancel}
                                activeOpacity={0.7}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Text style={styles.cancelLabel}>{cancelLabel}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.confirmBtn}
                                onPress={onConfirm}
                                activeOpacity={0.8}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <LinearGradient
                                    colors={confirmGradient as any}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.confirmGradient}
                                >
                                    <Text style={styles.confirmLabel}>{confirmLabel}</Text>
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
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.65)',
    },
    center: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    dialog: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: '#110a1e',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.2)',
        overflow: 'hidden',
    },
    topLine: {
        height: 2,
        width: '100%',
    },
    closeBtn: {
        position: 'absolute',
        top: 14,
        right: 14,
        zIndex: 10,
    },
    content: {
        padding: 28,
        alignItems: 'center',
    },
    iconRing: {
        width: 68,
        height: 68,
        borderRadius: 34,
        borderWidth: 1,
        overflow: 'hidden',
        marginBottom: 20,
    },
    iconBg: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 18,
        color: '#fff',
        fontFamily: 'Dank Mono Bold',
        textAlign: 'center',
        marginBottom: 10,
        letterSpacing: 0.2,
    },
    message: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.45)',
        textAlign: 'center',
        lineHeight: 21,
        marginBottom: 28,
        letterSpacing: 0.1,
    },
    buttons: {
        flexDirection: 'row',
        gap: 10,
        width: '100%',
    },
    cancelBtn: {
        flex: 1,
        height: 46,
        borderRadius: 12,
        backgroundColor: 'rgba(168,85,247,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false
    },
    confirmBtn: {
        flex: 1,
        height: 46,
        borderRadius: 12,
        overflow: 'hidden',
    },
    confirmGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    confirmLabel: {
        fontSize: 14,
        color: '#fff',
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false
    },
});