import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { GlassSurface } from '@/components/Shared/GlassSurface';

export interface WalletHeaderProps {
    title?: string;
    onBack?: () => void;
    rightAction?: React.ReactNode;
    centerContent?: React.ReactNode;
    isDark: boolean;
}

export default function WalletHeader({
    title,
    onBack,
    rightAction,
    centerContent,
    isDark,
}: WalletHeaderProps) {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const textColor = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.85)';
    const btnBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
    const btnBorder = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';

    const handleBack = () => {
        if (onBack) onBack();
        else router.back();
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
            <View style={styles.side}>
                <TouchableOpacity
                    onPress={handleBack}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={[
                        styles.backBtn,
                        Platform.OS === 'ios' && { borderWidth: 0 },
                        Platform.OS !== 'ios' && { backgroundColor: btnBg, borderColor: btnBorder }
                    ]}
                    activeOpacity={0.7}
                >
                    {Platform.OS === 'ios' ? (
                        <GlassSurface
                            style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', borderRadius: 14 }}
                            glassEffectStyle="regular"
                            colorScheme={isDark ? "dark" : "light"}
                            isInteractive
                            tintColor={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)"}
                        >
                            <ArrowLeft size={18} color={textColor} strokeWidth={1.8} />
                        </GlassSurface>
                    ) : (
                        <ArrowLeft size={18} color={textColor} strokeWidth={1.8} />
                    )}
                </TouchableOpacity>
            </View>

            <View style={styles.center}>
                {centerContent ?? (title ? (
                    <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
                        {title}
                    </Text>
                ) : null)}
            </View>

            <View style={styles.side}>
                {rightAction ?? <View style={styles.placeholder} />}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    side: {
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 14,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 18,
        includeFontPadding: false,
        letterSpacing: 0.3,
    },
    placeholder: {
        width: 40,
        height: 40,
    },
});
