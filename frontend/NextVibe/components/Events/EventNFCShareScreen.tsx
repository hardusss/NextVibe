import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, useColorScheme, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Radio } from 'lucide-react-native';
import LottieView from 'lottie-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { startSharing, stopSharing } from '@/modules/nfc-send';
import { startBroadcasting, stopBroadcasting } from '@/modules/ble-share';
import { storage } from '@/src/utils/storage';

export default function EventNFCShareScreen() {
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const params = useLocalSearchParams<{ eventId: string }>();
    const eventId = params.eventId;

    const [userId, setUserId] = useState<string | null>(null);

    const bg = isDark ? '#0A0410' : '#FFFFFF';
    const main = isDark ? '#FFFFFF' : '#111827';
    const muted = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(17,24,39,0.5)';
    const accent = '#A855F7';

    useEffect(() => {
        const init = async () => {
            try {
                const storedId = await storage.getItem('id');
                if (storedId) {
                    setUserId(storedId);
                    const shareUrl = `https://nextvibe.io/event-nfc-receive?eventId=${eventId}&userId=${storedId}`;

                    if (Platform.OS === 'ios') {
                        // iOS: Use BLE proximity broadcasting
                        startBroadcasting(shareUrl);
                    } else {
                        // Android: Use NFC HCE
                        startSharing(shareUrl);
                    }
                } else {
                    console.error('No user ID found in storage');
                }
            } catch (e) {
                console.error('Failed to get user details:', e);
            }
        };

        if (eventId) {
            init();
        }

        return () => {
            if (Platform.OS === 'ios') {
                stopBroadcasting();
            } else {
                stopSharing();
            }
        };
    }, [eventId]);

    if (!eventId) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
                <Text style={{ color: main }}>Invalid Event</Text>
            </SafeAreaView>
        );
    }

    const broadcastLabel = Platform.OS === 'ios' ? 'Bluetooth' : 'NFC';

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
            <View style={styles.header}>
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => router.back()}
                    style={styles.backBtn}
                >
                    <ChevronLeft size={22} color={main} strokeWidth={2} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: main }]}>
                    {Platform.OS === 'ios' ? 'BLE Networking' : 'NFC Networking'}
                </Text>
                <View style={{ width: 44 }} />
            </View>

            <View style={styles.main}>
                {!userId ? (
                    <ActivityIndicator size="large" color={accent} />
                ) : (
                    <Animated.View entering={FadeInUp.springify().damping(15)} style={styles.centerContent}>
                        <Animated.View entering={FadeInDown.delay(200)}>
                            <View style={styles.animationContainer}>
                                <LottieView
                                    autoPlay
                                    loop
                                    style={styles.lottie}
                                    source={require('@/assets/lottie/scanning.json')}
                                />
                                <View style={[styles.iconCircle, { backgroundColor: accent }]}>
                                    <Radio size={32} color="#ffffff" />
                                </View>
                            </View>
                        </Animated.View>

                        <Text style={[styles.heading, { color: main }]}>
                            Ready to Network
                        </Text>
                        <Text style={[styles.description, { color: muted }]}>
                            Hold your phone near another attendee's phone to connect and share reputation via {broadcastLabel}!
                        </Text>

                        <View style={[styles.infoCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                            <Text style={[styles.infoCardText, { color: muted }]}>
                                {Platform.OS === 'ios'
                                    ? "Broadcasting via Bluetooth. Make sure the other person's app is open."
                                    : "Make sure the other person's screen is unlocked."
                                }
                            </Text>
                        </View>
                    </Animated.View>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 6,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 6,
        marginBottom: 14,
        paddingHorizontal: 18,
    },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 16,
        includeFontPadding: false,
    },
    main: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingBottom: 80,
    },
    centerContent: {
        alignItems: 'center',
        gap: 16,
        width: '100%',
    },
    animationContainer: {
        width: 250,
        height: 250,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        marginBottom: 20,
    },
    lottie: {
        width: 250,
        height: 250,
        position: 'absolute',
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        shadowColor: '#A855F7',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 10,
    },
    heading: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 24,
        includeFontPadding: false,
        textAlign: 'center',
    },
    description: {
        fontFamily: 'Dank Mono',
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
        includeFontPadding: false,
        paddingHorizontal: 10,
    },
    infoCard: {
        marginTop: 20,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        width: '100%',
    },
    infoCardText: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        textAlign: 'center',
    }
});
