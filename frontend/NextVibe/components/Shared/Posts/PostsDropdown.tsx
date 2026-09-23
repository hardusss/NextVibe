import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { Ban, CameraOff, EyeOff, Eye, Flag, PencilLine, Trash2 } from 'lucide-react-native';
import { useState, useEffect, useRef } from "react";
import { Portal } from "@gorhom/portal";
import deletePost from "@/src/api/delete.post";
import ConfirmDialog from "../Toasts/ConfirmDialog";
import ReportPostModal from "@/components/Shared/Posts/ReportPostModal";
import BlockUserSheet, { BlockTarget } from "@/components/Shared/Block/BlockUserSheet";
import CaptionEditor from "@/components/Meet/CaptionEditor";
import { TAKEDOWN_MESSAGE, TAKEDOWN_TITLE } from "@/components/Meet/takedownCopy";
import { setMeetPhotoHidden, takeDownMeetPhoto } from "@/src/api/meetPhoto";
import { bumpMeetPhoto } from "@/src/stores/meetPhotoStore";

/** What changed on a Proof of Meet post through this menu. */
export type MeetPostChange =
    | { kind: 'caption'; about: string }
    | { kind: 'hidden'; hidden: boolean }
    | { kind: 'removed' }
    | { kind: 'error'; message: string };

export default function DropDown({
    isVisible,
    isOwner,
    postId,
    onClose,
    onPostDeleted,
    onPostDeletedFail,
    onReportResult,
    ownerId,
    ownerUsername,
    onBlocked,
    dialogHost,
    meetSlug = null,
    isCoAuthor = false,
    about = "",
    hiddenOnMyProfile = false,
    onMeetChange,
}: {
    isVisible: boolean,
    isOwner: boolean,
    postId: number,
    onClose: () => void,
    onPostDeleted?: () => void,
    onPostDeletedFail?: () => void,
    onReportResult?: (reported: boolean, message?: string) => void,
    /** Post author; the Block item shows only when it's given. */
    ownerId?: number,
    ownerUsername?: string,
    onBlocked?: (userId: number) => void,
    /**
     * Inside another Modal (the profile's post popup): the name of a PortalHost
     * at that Modal's root. The confirm and report dialogs render there, over
     * the whole popup. As Modals of their own, iOS won't show the report's
     * confirm (one presented Modal per parent), and rendered in place they get
     * squeezed into the ⋮ button's box: a thin line instead of a dialog.
     */
    dialogHost?: string,
    /** A Proof of Meet post: its two people get caption / hide / remove photo instead of Delete. */
    meetSlug?: string | null,
    isCoAuthor?: boolean,
    about?: string,
    hiddenOnMyProfile?: boolean,
    onMeetChange?: (change: MeetPostChange) => void,
}) {
    const [showConfirm, setShowConfirm] = useState(false);
    const [reportModalVisible, setReportModalVisible] = useState(false);
    const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
    const [showTakedown, setShowTakedown] = useState(false);
    const [captionOpen, setCaptionOpen] = useState(false);
    const [hidden, setHidden] = useState(hiddenOnMyProfile);
    const inMeet = !!meetSlug && (isOwner || isCoAuthor);
    const useModal = !dialogHost;

    useEffect(() => setHidden(hiddenOnMyProfile), [hiddenOnMyProfile]);

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

    const toggleHidden = async () => {
        onClose();
        if (!meetSlug) return;
        try {
            await setMeetPhotoHidden(meetSlug, !hidden);
            setHidden(!hidden);
            onMeetChange?.({ kind: 'hidden', hidden: !hidden });
        } catch (error: any) {
            onMeetChange?.({ kind: 'error', message: error?.message ?? "Couldn't update the post. Try again." });
        }
    };

    const handleTakedown = async () => {
        setShowTakedown(false);
        if (!meetSlug) return;
        try {
            await takeDownMeetPhoto(meetSlug);
            bumpMeetPhoto(meetSlug);
            onMeetChange?.({ kind: 'removed' });
            setTimeout(() => onPostDeleted?.(), 200);
        } catch (error: any) {
            onMeetChange?.({ kind: 'error', message: error?.message ?? "Couldn't remove the photo. Try again." });
        }
    };

    const items = [
        {
            label: "Edit caption",
            icon: <PencilLine size={17} color="#C4B5FD" strokeWidth={1.8} />,
            color: "#A855F7",
            onClick: () => { onClose(); setTimeout(() => setCaptionOpen(true), 200); },
            show: inMeet,
        },
        {
            label: hidden ? "Show on profile" : "Hide from profile",
            icon: hidden ? <Eye size={17} color="#C4B5FD" strokeWidth={1.8} /> : <EyeOff size={17} color="#C4B5FD" strokeWidth={1.8} />,
            color: "#A855F7",
            onClick: toggleHidden,
            show: inMeet,
        },
        {
            label: "Remove photo",
            icon: <CameraOff size={17} color="#FCA5A5" strokeWidth={1.8} />,
            color: "#EF4444",
            onClick: () => { onClose(); setTimeout(() => setShowTakedown(true), 200); },
            show: inMeet,
        },
        {
            label: "Report",
            icon: <Flag size={17} color="#C4B5FD" strokeWidth={1.8} />,
            color: "#A855F7",
            onClick: () => { onClose(); setTimeout(() => setReportModalVisible(true), 200); },
            show: !isOwner && !inMeet,
        },
        {
            label: "Block",
            icon: <Ban size={17} color="#FCA5A5" strokeWidth={1.8} />,
            color: "#EF4444",
            onClick: () => {
                onClose();
                if (ownerId) setTimeout(() => setBlockTarget({ userId: ownerId, username: ownerUsername ?? "" }), 200);
            },
            show: !isOwner && !inMeet && !!ownerId,
        },
        {
            label: "Delete",
            icon: <Trash2 size={17} color="#FCA5A5" strokeWidth={1.8} />,
            color: "#EF4444",
            onClick: handleDeleteClick,
            show: isOwner && !meetSlug,
        },
    ].filter(item => item.show);

    const dialogs = (
        <>
            <ConfirmDialog
                visible={showConfirm}
                onConfirm={handleConfirmDelete}
                onCancel={() => setShowConfirm(false)}
                useModal={useModal}
            />
            <ReportPostModal
                postId={postId}
                visible={reportModalVisible}
                onClose={(reported?: boolean, message?: string) => {
                    setReportModalVisible(false);
                    onReportResult?.(!!reported, message);
                }}
                useModal={useModal}
            />
            {meetSlug && (
                <ConfirmDialog
                    visible={showTakedown}
                    title={TAKEDOWN_TITLE}
                    message={TAKEDOWN_MESSAGE}
                    confirmLabel="Remove photo"
                    onConfirm={handleTakedown}
                    onCancel={() => setShowTakedown(false)}
                    useModal={useModal}
                />
            )}
        </>
    );

    // Always render modals so they survive isVisible=false
    const modals = (
        <>
            {dialogHost ? <Portal hostName={dialogHost}>{dialogs}</Portal> : dialogs}
            <BlockUserSheet
                target={blockTarget}
                onClose={() => setBlockTarget(null)}
                onBlocked={onBlocked}
            />
            {meetSlug && (
                <CaptionEditor
                    visible={captionOpen}
                    slug={meetSlug}
                    initial={about ?? ""}
                    onClose={() => setCaptionOpen(false)}
                    onSaved={(text) => onMeetChange?.({ kind: 'caption', about: text })}
                />
            )}
        </>
    );

    if (!isVisible) return modals;

    return (
        <>
            <Animated.View style={[
                styles.container,
                inMeet && { width: 200 },
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