import React, { useCallback, useMemo, forwardRef, useState } from 'react';
import { View, Text, StyleSheet, useColorScheme, ScrollView, ActivityIndicator } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import FastImage from 'react-native-fast-image';
import { Star, MapPin } from 'lucide-react-native';
import axios from 'axios';
import { storage } from '@/src/utils/storage';
import GetApiUrl from '@/src/utils/url_api';

export type EventConnectionsSheetRef = BottomSheetModal;

type Connection = {
    user_id: number;
    username: string;
    avatar: string | null;
};

type EventData = {
    event_id: number;
    event_name: string;
    reputation_earned: number;
    connections: Connection[];
    checked_in_at: string;
};

export const EventConnectionsSheet = forwardRef<EventConnectionsSheetRef>((props, ref) => {
    const isDark = useColorScheme() === 'dark';
    const snapPoints = useMemo(() => ['60%', '90%'], []);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<EventData[]>([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = await storage.getItem("access");
            const res = await axios.get(`${GetApiUrl()}/posts/user-event-connections/`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setData(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleComponentChange = useCallback((index: number) => {
        if (index >= 0) fetchData();
    }, []);

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.6} />
        ),
        []
    );

    const bg = isDark ? '#0A0410' : '#FFFFFF';
    const mainText = isDark ? '#FFF' : '#111';
    const mutedText = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';

    return (
        <BottomSheetModal
            ref={ref}
            index={0}
            snapPoints={snapPoints}
            backdropComponent={renderBackdrop}
            onChange={handleComponentChange}
            backgroundStyle={{ backgroundColor: bg }}
            handleIndicatorStyle={{ backgroundColor: mutedText }}
        >
            <View style={[styles.container, { backgroundColor: bg }]}>
                <Text style={[styles.title, { color: mainText }]}>Events & Connections</Text>
                
                {loading ? (
                    <ActivityIndicator style={{ marginTop: 40 }} color="#22c55e" />
                ) : data.length === 0 ? (
                    <View style={styles.emptyWrap}>
                        <Text style={[styles.emptyText, { color: mutedText }]}>
                            Attend events and check-in to earn reputation and connect with others!
                        </Text>
                    </View>
                ) : (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                        {data.map((item, idx) => (
                            <View key={idx} style={[styles.eventCard, { 
                                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'
                            }]}>
                                <View style={styles.eventHeader}>
                                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <MapPin size={16} color="#A855F7" />
                                        <Text style={[styles.eventName, { color: mainText }]} numberOfLines={1}>
                                            {item.event_name || 'Event'}
                                        </Text>
                                    </View>
                                    <View style={[styles.repBadge, {
                                        backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.15)'
                                    }]}>
                                        <Star size={12} color="#22c55e" fill="#22c55e" />
                                        <Text style={[styles.repText, { color: '#22c55e' }]}>
                                            +{item.reputation_earned} Rep
                                        </Text>
                                    </View>
                                </View>

                                {item.connections.length > 0 ? (
                                    <View style={styles.connectionsWrap}>
                                        <Text style={[styles.connTitle, { color: mutedText }]}>Connected with:</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                            {item.connections.map((c, cIdx) => (
                                                <View key={cIdx} style={styles.userBubble}>
                                                    {c.avatar ? (
                                                        <FastImage 
                                                            source={{ uri: c.avatar }}
                                                            style={styles.avatar} 
                                                        />
                                                    ) : (
                                                        <View style={[styles.avatar, { backgroundColor: isDark ? '#333' : '#ddd' }]} />
                                                    )}
                                                    <Text style={[styles.username, { color: mainText }]} numberOfLines={1}>
                                                        {c.username}
                                                    </Text>
                                                </View>
                                            ))}
                                        </ScrollView>
                                    </View>
                                ) : (
                                    <View style={{ marginTop: 12 }}>
                                        <Text style={[styles.connTitle, { color: mutedText }]}>No connections at this event.</Text>
                                    </View>
                                )}
                            </View>
                        ))}
                    </ScrollView>
                )}
            </View>
        </BottomSheetModal>
    );
});

const styles = StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
    title: { fontFamily: 'Dank Mono Bold', fontSize: 20, marginBottom: 16, textAlign: 'center' },
    scroll: { paddingBottom: 40 },
    eventCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 16,
    },
    eventHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    eventName: { fontFamily: 'Dank Mono Bold', fontSize: 16, flexShrink: 1 },
    repBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
    },
    repText: { fontFamily: 'Dank Mono Bold', fontSize: 12 },
    connectionsWrap: {
        marginTop: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(150,150,150,0.1)',
        paddingTop: 12,
    },
    connTitle: { fontFamily: 'Dank Mono', fontSize: 12, marginBottom: 8 },
    userBubble: { alignItems: 'center', marginRight: 16, width: 50 },
    avatar: { width: 44, height: 44, borderRadius: 22, marginBottom: 4 },
    username: { fontFamily: 'Dank Mono', fontSize: 10, textAlign: 'center', width: '100%' },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyText: { fontFamily: 'Dank Mono', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
