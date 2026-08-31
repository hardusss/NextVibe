import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useColorScheme, Vibration, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { verifyProximityToken } from '@/src/api/proximity.token';

export default function ProximityTokenScreen() {
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const params = useLocalSearchParams<{ t: string }>();
    const token = params.t;

    const [status, setStatus] = useState<'verifying' | 'done'>('verifying');

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

                setStatus('done');

                // Route to the appropriate result screen based on interaction type
                if (result.interaction_type === 'networking') {
                    router.replace({
                        pathname: '/event-nfc-receive',
                        params: {
                            t: token,
                            // Pass result data so the screen doesn't re-verify
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
                setStatus('done');
                // On error, show a brief message then go back
                Vibration.vibrate([0, 200]);
                setTimeout(() => router.back(), 1500);
            }
        };

        verify();
    }, [token]);

    const bg = isDark ? '#0A0410' : '#FFFFFF';
    const accent = '#A855F7';

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
            <View style={styles.center}>
                <ActivityIndicator size="large" color={accent} />
                <Text style={[styles.text, { color: isDark ? '#ffffff' : '#111827' }]}>
                    Verifying...
                </Text>
            </View>
        </SafeAreaView>
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
    },
    text: {
        fontFamily: 'Dank Mono',
        fontSize: 14,
    },
});

