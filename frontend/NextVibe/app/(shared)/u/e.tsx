import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useColorScheme, Vibration, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { verifyProximityToken } from '@/src/api/proximity.token';
import { ShieldX } from 'lucide-react-native';

export default function ProximityTokenScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const params = useLocalSearchParams<{ t?: string; id?: string }>();
    const token = params.t;

    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!token) {
            router.back();
            return;
        }

        const verify = async () => {
            // Immediate haptic feedback
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            Vibration.vibrate([0, 80, 50, 80]);

            try {
                // Get location
                let lat: number | undefined;
                let lng: number | undefined;
                try {
                    const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
                    if (locStatus === 'granted') {
                        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                        if (!location.mocked) {
                            lat = location.coords.latitude;
                            lng = location.coords.longitude;
                        }
                    }
                } catch (e) {
                    console.warn('Location error:', e);
                }

                const result = await verifyProximityToken(token, lat, lng);

                // Route to the appropriate result screen based on interaction type
                if (result.interaction_type === 'networking') {
                    router.replace({
                        pathname: '/event-nfc-receive',
                        params: {
                            t: token,
                            _verified: '1',
                            _earned_points: String(result.earned_points || 0),
                            _username: result.scanned_user?.username || '',
                            _avatar: result.scanned_user?.avatar || '',
                            _is_official: result.scanned_user?.is_official ? '1' : '0',
                        },
                    } as any);
                } else if (result.interaction_type === 'checkin') {
                    router.replace({
                        pathname: '/event-checkin',
                        params: {
                            t: token,
                            _verified: result.verified ? '1' : '0',
                            _post_name: result.post_name || '',
                            _message: result.message || '',
                            _post_image: result.post_image || '',
                        },
                    } as any);
                } else {
                    router.back();
                }
            } catch (error: any) {
                console.error('Token verification failed:', error);
                Vibration.vibrate([0, 200]);
                const msg = error?.response?.data?.error || 'Verification failed. Token may be expired or already used.';
                setErrorMessage(msg);
            }
        };

        verify();
    }, [token]);

    const bg = isDark ? '#0A0410' : '#FFFFFF';
    const main = isDark ? '#ffffff' : '#111827';
    const muted = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(17,24,39,0.5)';
    const accent = '#A855F7';
    const border = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';

    return (
        <View style={[styles.container, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={styles.center}>
                {errorMessage ? (
                    <View style={styles.errorContainer}>
                        <View style={[styles.iconCircle, {
                            backgroundColor: "rgba(239,68,68,0.1)",
                            borderColor: "rgba(239,68,68,0.25)",
                        }]}>
                            <ShieldX size={44} color="#f87171" strokeWidth={1.5} />
                        </View>
                        <Text style={[styles.errorTitle, { color: '#f87171' }]}>
                            Connection Failed
                        </Text>
                        <Text style={[styles.errorSubtitle, { color: muted }]}>
                            {errorMessage}
                        </Text>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            activeOpacity={0.8}
                            style={[styles.backBtn, {
                                backgroundColor: "rgba(255,255,255,0.05)",
                                borderColor: border,
                            }]}
                        >
                            <Text style={[styles.backBtnText, { color: main }]}>
                                Go Back
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <ActivityIndicator size="large" color={accent} />
                        <Text style={[styles.text, { color: main }]}>
                            Connecting...
                        </Text>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        paddingHorizontal: 32,
    },
    text: {
        fontFamily: 'Dank Mono',
        fontSize: 14,
    },
    errorContainer: {
        alignItems: 'center',
        gap: 12,
        width: '100%',
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    errorTitle: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 20,
        textAlign: 'center',
    },
    errorSubtitle: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 18,
    },
    backBtn: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1,
        marginTop: 16,
    },
    backBtnText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 14,
    },
});
