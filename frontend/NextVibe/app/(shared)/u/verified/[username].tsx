import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { UserRound } from "lucide-react-native";

import { ActivityIndicator } from "@/components/CustomActivityIndicator";
import lookupUserId from "@/src/api/user.lookup";
import { storage } from "@/src/utils/storage";
import { safeBack } from "@/src/utils/safeBack";
import { HIT_TARGET, radius, space } from "@/src/theme/tokens";

/**
 * Opens a profile from a username link: nextvibe.io/u/verified/<username> (the
 * Seeker share page, which Android and iOS open in the app) and
 * nextvibe://profile/<username> (that page's "Open in NextVibe"). Replaces
 * itself with the profile.
 */
export default function UsernameLinkScreen() {
    const { username } = useLocalSearchParams<{ username: string }>();
    const router = useRouter();
    const isDark = useColorScheme() === "dark";
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [token, myId] = await Promise.all([storage.getItem("access"), storage.getItem("id")]);
            if (cancelled) return;
            if (!token) {
                router.replace("/splash"); // signed out: the normal start flow
                return;
            }
            try {
                const userId = await lookupUserId(String(username ?? ""));
                if (cancelled) return;
                if (userId === null) {
                    setNotFound(true);
                } else if (String(userId) === myId) {
                    router.dismissTo("/profile");
                } else {
                    router.replace({ pathname: "/user-profile", params: { id: String(userId) } });
                }
            } catch {
                if (!cancelled) setNotFound(true);
            }
        })();
        return () => { cancelled = true; };
    }, [username]);

    const bg = isDark ? "#0A0410" : "#ffffff";
    const muted = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";

    return (
        <View style={[styles.container, { backgroundColor: bg }]}>
            {notFound ? (
                <>
                    <View style={[styles.icon, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }]}>
                        <UserRound size={40} color={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)"} />
                    </View>
                    <Text style={[styles.text, { color: muted }]}>This profile isn't available</Text>
                    <TouchableOpacity style={styles.button} activeOpacity={0.84} onPress={() => safeBack(router)}>
                        <Text style={styles.buttonText}>Go back</Text>
                    </TouchableOpacity>
                </>
            ) : (
                <ActivityIndicator size="large" color="#58a6ff" />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: space.lg,
    },
    icon: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: "center",
        justifyContent: "center",
    },
    text: {
        fontFamily: "Dank Mono",
        fontSize: 15,
        marginTop: space.lg,
        textAlign: "center",
    },
    button: {
        minHeight: HIT_TARGET,
        justifyContent: "center",
        marginTop: space.xl,
        paddingHorizontal: space.xl,
        borderRadius: radius.md,
        backgroundColor: "#6A00F4",
    },
    buttonText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 15,
        color: "#ffffff",
    },
});
