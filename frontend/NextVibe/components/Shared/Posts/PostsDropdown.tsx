import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { Flag, Trash2 } from 'lucide-react-native';
import { useState, useEffect, useRef } from "react";
import deletePost from "@/src/api/delete.post";
import ConfirmDialog from "../Toasts/ConfirmDialog";
import ReportPostModal from "@/components/Shared/Posts/ReportPostModal";

export default function DropDown({
    isVisible,
    isOwner,
    postId,
    onClose,
    onPostDeleted,
    onPostDeletedFail,
    onReportResult,
}: {
    isVisible: boolean,
    isOwner: boolean,
    postId: number,
    onClose: () => void,
    onPostDeleted?: () => void,
    onPostDeletedFail?: () => void,
    onReportResult?: (reported: boolean, message?: string) => void,
}) {
    const [showConfirm, setShowConfirm] = useState(false);
    const [reportModalVisible, setReportModalVisible] = useState(false);

    const scaleAnim = useRef(new Animated.Value(0)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isVisible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 100,
                    friction: 8,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 180,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(scaleAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
                Animated.timing(opacityAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
            ]).start();
        }
    }, [isVisible]);

    const handleDeleteClick = () => {
        onClose();
        setTimeout(() => setShowConfirm(true), 200);
    };

    const handleConfirmDelete = async () => {
        setShowConfirm(false);
        try {
            const response = await deletePost(postId);
            if (response.data !== "Post deleted") {
                setTimeout(() => onPostDeletedFail?.(), 200);
                return;
            }
            setTimeout(() => setTimeout(() => onPostDeleted?.(), 500), 200);
        } catch {
            setTimeout(() => onPostDeletedFail?.(), 200);
        }
    };

    const items = [
        {
            label: "Report",
            icon: <Flag size={17} color="#C4B5FD" strokeWidth={1.8} />,
            color: "#A855F7",
            onClick: () => { onClose(); setTimeout(() => setReportModalVisible(true), 200); },
            show: !isOwner,
        },
        {
            label: "Delete",
            icon: <Trash2 size={17} color="#FCA5A5" strokeWidth={1.8} />,
            color: "#EF4444",
            onClick: handleDeleteClick,
            show: isOwner,
        },
    ].filter(item => item.show);

    // Always render modals so they survive isVisible=false
    const modals = (
        <>
            <ConfirmDialog
                visible={showConfirm}
                onConfirm={handleConfirmDelete}
                onCancel={() => setShowConfirm(false)}
            />
            <ReportPostModal
                postId={postId}
                visible={reportModalVisible}
                onClose={(reported?: boolean, message?: string) => {
                    setReportModalVisible(false);
                    onReportResult?.(!!reported, message);
                }}
            />
        </>
    );

    if (!isVisible) return modals;

    return (
        <>
            <Animated.View style={[
                styles.container,
                { opacity: opacityAnim, transform: [{ scale: scaleAnim }, { translateY: scaleAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }
            ]}>
                {/* Top gradient line */}
                <LinearGradient
                    colors={['#A855F7', '#7C3AED']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.topLine}
                />

                {items.map((item, i) => (
                    <TouchableOpacity
                        key={i}
                        activeOpacity={0.7}
                        onPress={item.onClick}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={[styles.item, i < items.length - 1 && styles.itemBorder]}
                    >
                        <View style={[styles.iconBox, { borderColor: `${item.color}30`, backgroundColor: `${item.color}12` }]}>
                            {item.icon}
                        </View>
                        <Text style={[styles.label, { color: item.color === '#EF4444' ? '#FCA5A5' : '#C4B5FD' }]}>
                            {item.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </Animated.View>

            {modals}
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        width: 160,
        position: 'absolute',
        right: 0,
        top: 40,
        backgroundColor: '#110a1e',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.2)',
        overflow: 'hidden',
        zIndex: 999999,
    },
    topLine: {
        height: 2,
        width: '100%',
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 13,
    },
    itemBorder: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(168,85,247,0.1)',
    },
    iconBox: {
        width: 32,
        height: 32,
        borderRadius: 8,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    label: {
        fontSize: 14,
        fontFamily: 'Dank Mono Bold',
        letterSpacing: 0.1,
        includeFontPadding: false
    },
});