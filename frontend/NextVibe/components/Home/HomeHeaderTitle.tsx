import { TouchableOpacity, View, Text, Platform } from "react-native";
import { useState, useCallback } from "react";
import { useColorScheme } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Bell } from "lucide-react-native";
import getCountUnreadNotifications from "@/src/api/get.count.unread.notification";

const GlassViewComponent = Platform.OS === 'ios' ? require('expo-glass-effect').GlassView : View;

export default function HomeHeaderTitle() {
    const isDark = useColorScheme() === "dark";
    const router = useRouter();
    const [notificationsCount, setNotificationsCount] = useState(0);

    const displayCount = (): string => {
        return (
            notificationsCount > 999
                ? '999+'
                : notificationsCount > 99
                    ? '99+'
                    : notificationsCount > 9
                        ? '9+'
                        : notificationsCount.toString()
        );
    };

    let rightPosition = -4;
    if (notificationsCount > 9 && notificationsCount <= 99) {
        rightPosition = -6;
    } else if (notificationsCount <= 9) {
        rightPosition = -4;
    } else {
        rightPosition = -8;
    }

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

    const badge = notificationsCount > 0 && (
        <View style={{
            position: "absolute",
            top: 2,
            right: rightPosition,
            backgroundColor: "#A855F7",
            paddingHorizontal: 4,
            height: 16,
            minWidth: 16,
            borderRadius: 8,
            borderWidth: 1.5,
            borderColor: isDark ? '#0A0410' : '#fff',
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
        }}>
            <Text style={{ color: "#fff", fontSize: notificationsCount > 999 ? 7 : 8, fontFamily: "Dank Mono Bold", textAlign: "center" }}>
                {displayCount()}
            </Text>
        </View>
    );

    return (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", paddingRight: 16 }}>
            <Text style={{ fontFamily: "Dank Mono Bold", fontSize: 26, color: isDark ? "#F3EEFF" : "#1A1225", letterSpacing: -0.75 }}>
                NextVibe
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 15 }}>
                {Platform.OS === 'ios' ? (
                    <TouchableOpacity
                        activeOpacity={0.7}
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                        onPress={() => router.push("/notifications")}
                        style={{ position: 'relative', width: 40, height: 40 }}
                    >
                        <GlassViewComponent
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                justifyContent: "center",
                                alignItems: "center",
                            }}
                            glassEffectStyle="regular"
                            colorScheme={isDark ? "dark" : "light"}
                        >
                            <Bell size={22} color={isDark ? "#fafafa" : "#1A1225"} />
                        </GlassViewComponent>
                        {badge}
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity activeOpacity={0.7} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => router.push("/notifications")} style={{ position: "relative", justifyContent: "center", alignItems: "center", height: 40, width: 40 }}>
                        <Bell size={24} color={isDark ? "#fafafa" : "#1A1225"} />
                        {badge}
                    </TouchableOpacity>
                )}
                <Image source={require("@/assets/logo.png")} style={{ width: 32, height: 32 }} contentFit="contain" />
            </View>
        </View>
    );
}
