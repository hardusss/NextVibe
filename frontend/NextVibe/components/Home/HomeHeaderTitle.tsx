import { TouchableOpacity, View, Text, Platform, StyleSheet } from "react-native";
import { useState, useCallback } from "react";
import { useColorScheme } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Bell, Plus, MessageSquare } from "lucide-react-native";
import getCountUnreadNotifications from "@/src/api/get.count.unread.notification";
import GlassSurface from "@/components/Shared/GlassSurface";

type BtnProps = { isDark: boolean; onPress: () => void; badge?: React.ReactNode };

function CameraBtn({ isDark, onPress }: BtnProps) {
    if (Platform.OS === 'ios') {
        return (
            <TouchableOpacity
                activeOpacity={0.7}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                onPress={onPress}
                style={{ width: 40, height: 40, zIndex: 10 }}
            >
                <GlassSurface
                    style={styles.glassBtn}
                    glassEffectStyle="regular"
                    colorScheme={isDark ? "dark" : "light"}
                    fallbackBackgroundColor={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)'}
                >
                    <Plus size={22} color={isDark ? "#fafafa" : "#1A1225"} strokeWidth={2} />
                </GlassSurface>
            </TouchableOpacity>
        );
    }
    return (
        <TouchableOpacity
            activeOpacity={0.7}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            onPress={onPress}
            style={[styles.roundBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)', zIndex: 10 }]}
        >
            <Plus size={22} color={isDark ? "#fafafa" : "#1A1225"} strokeWidth={2} />
        </TouchableOpacity>
    );
}

function ChatBtn({ isDark, onPress }: BtnProps) {
    if (Platform.OS === 'ios') {
        return (
            <TouchableOpacity
                activeOpacity={0.7}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                onPress={onPress}
                style={{ width: 40, height: 40, zIndex: 10 }}
            >
                <GlassSurface
                    style={styles.glassBtn}
                    glassEffectStyle="regular"
                    colorScheme={isDark ? "dark" : "light"}
                    fallbackBackgroundColor={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)'}
                >
                    <MessageSquare size={22} color={isDark ? "#fafafa" : "#1A1225"} strokeWidth={2} />
                </GlassSurface>
            </TouchableOpacity>
        );
    }
    return (
        <TouchableOpacity
            activeOpacity={0.7}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            onPress={onPress}
            style={[styles.roundBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)', zIndex: 10 }]}
        >
            <MessageSquare size={22} color={isDark ? "#fafafa" : "#1A1225"} strokeWidth={2} />
        </TouchableOpacity>
    );
}

function BellBtn({ isDark, onPress, badge }: BtnProps) {
    if (Platform.OS === 'ios') {
        return (
            <TouchableOpacity
                activeOpacity={0.7}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                onPress={onPress}
                style={{ position: 'relative', width: 40, height: 40, zIndex: 10 }}
            >
                <GlassSurface
                    style={styles.glassBtn}
                    glassEffectStyle="regular"
                    colorScheme={isDark ? "dark" : "light"}
                    fallbackBackgroundColor={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)'}
                >
                    <Bell size={22} color={isDark ? "#fafafa" : "#1A1225"} />
                </GlassSurface>
                {badge}
            </TouchableOpacity>
        );
    }
    return (
        <TouchableOpacity
            activeOpacity={0.7}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            onPress={onPress}
            style={{ position: "relative", justifyContent: "center", alignItems: "center", height: 40, width: 40, zIndex: 10 }}
        >
            <Bell size={24} color={isDark ? "#fafafa" : "#1A1225"} />
            {badge}
        </TouchableOpacity>
    );
}

export default function HomeHeaderTitle() {
    const isDark = useColorScheme() === "dark";
    const router = useRouter();
    const [notificationsCount, setNotificationsCount] = useState(0);

    let rightPosition = -4;
    if (notificationsCount > 9 && notificationsCount <= 99) rightPosition = -6;
    else if (notificationsCount > 99) rightPosition = -8;

    const displayCount = (): string => {
        if (notificationsCount > 999) return '999+';
        if (notificationsCount > 99) return '99+';
        if (notificationsCount > 9) return '9+';
        return notificationsCount.toString();
    };

    const fetchCount = async () => {
        const count = await getCountUnreadNotifications();
        setNotificationsCount(count);
    };

    useFocusEffect(
        useCallback(() => {
            fetchCount();
            const interval = setInterval(fetchCount, 30000);
            return () => clearInterval(interval);
        }, [])
    );

    const badge = notificationsCount > 0 ? (
        <View style={[styles.badge, { right: rightPosition, borderColor: isDark ? '#0A0410' : '#fff' }]}>
            <Text style={[styles.badgeText, { fontSize: notificationsCount > 999 ? 7 : 8 }]}>
                {displayCount()}
            </Text>
        </View>
    ) : undefined;

    return (
        <View style={styles.row}>
            {/* Title Container (Background layer with pointerEvents="none") */}
            <View style={styles.titleContainer} pointerEvents="none">
                <Text
                    style={[
                        styles.title,
                        { color: isDark ? "#F3EEFF" : "#1A1225" }
                    ]}
                    numberOfLines={1}
                >
                    NextVibe
                </Text>
            </View>

            {/* Left side button */}
            {Platform.OS === 'ios' && (
                <CameraBtn isDark={isDark} onPress={() => router.push("/(shared)/camera")} />
            )}

            {/* Chat button (Android only) */}
            {Platform.OS === 'android' && (
                <ChatBtn isDark={isDark} onPress={() => router.push("/chats")} />
            )}

            {/* Right side — bell + logo */}
            <View style={styles.rightGroup}>
                <BellBtn isDark={isDark} onPress={() => router.push("/notifications")} badge={badge} />
                <Image source={require("@/assets/logo.png")} style={styles.logo} contentFit="contain" />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        paddingRight: 16,
        paddingLeft: 0,
        height: 40,
        position: "relative",
    },
    titleContainer: {
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1,
    },
    title: {
        fontFamily: "Dank Mono Bold",
        fontSize: 26,
        letterSpacing: -0.75,
        includeFontPadding: false,
        textAlign: "center",
    },
    rightGroup: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        zIndex: 10,
    },
    glassBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: "center",
        alignItems: "center",
    },
    roundBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: "center",
        alignItems: "center",
    },
    badge: {
        position: "absolute",
        top: 2,
        backgroundColor: "#A855F7",
        paddingHorizontal: 4,
        height: 16,
        minWidth: 16,
        borderRadius: 8,
        borderWidth: 1.5,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
    },
    badgeText: {
        color: "#fff",
        fontFamily: "Dank Mono Bold",
        textAlign: "center",
    },
    logo: {
        width: 32,
        height: 32,
    },
});
