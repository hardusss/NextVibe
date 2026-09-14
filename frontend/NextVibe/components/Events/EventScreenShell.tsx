import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { space, colors, radius, type as typeScale } from '@/src/theme/tokens';

type EventScreenShellProps = {
    title: string;
    subtitle?: string | null;
    children: React.ReactNode;
};

/**
 * Shared chrome for the event flow screens (check-in, tap-to-meet share/receive):
 * full-bleed gradient background in dark mode, back button, centered title.
 */
export default function EventScreenShell({ title, subtitle, children }: EventScreenShellProps) {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const main = isDark ? colors.text : '#111827';
    const mutedColor = isDark ? colors.sub : 'rgba(17,24,39,0.5)';

    return (
        <View style={[styles.container, { backgroundColor: isDark ? colors.bg : '#FFFFFF' }]}>
            {isDark && (
                <LinearGradient
                    colors={[colors.bg, '#1a0a2e', colors.bg]}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                />
            )}
            <View style={{ flex: 1, paddingTop: insets.top + space.xs, paddingBottom: insets.bottom }}>
                <View style={styles.header}>
                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => router.back()}
                        style={styles.backBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                    >
                        <ChevronLeft size={22} color={main} strokeWidth={2} />
                    </TouchableOpacity>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={[styles.headerTitle, { color: main }]}>{title}</Text>
                        {!!subtitle && (
                            <Text style={[styles.headerSub, { color: mutedColor }]}>{subtitle}</Text>
                        )}
                    </View>
                    <View style={{ width: 44 }} />
                </View>
                <View style={styles.main}>{children}</View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: space.xs + 2,
        marginBottom: space.md + 2,
        paddingHorizontal: space.lg + 2,
    },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.body,
        includeFontPadding: false,
    },
    headerSub: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        marginTop: 2,
        includeFontPadding: false,
    },
    main: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: space.xxl,
        paddingBottom: space.xl,
    },
});
