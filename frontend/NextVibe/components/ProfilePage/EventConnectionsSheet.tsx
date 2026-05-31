import React, { useCallback, useMemo, forwardRef, useState, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, useColorScheme, ActivityIndicator, TouchableOpacity } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import FastImage from 'react-native-fast-image';
import { BlurView } from '@react-native-community/blur';
import VerifyBadge from "../VerifyBadge";
import { Star, Layers, Users, ChevronDown, ShieldCheck, Radio } from 'lucide-react-native';
import axios from 'axios';
import { storage } from '@/src/utils/storage';
import GetApiUrl from '@/src/utils/url_api';
import { useRouter } from 'expo-router';

export interface EventConnectionsSheetRef {
    present: (totalRep?: number) => void;
    dismiss: () => void;
}

type Connection = {
    user_id: number;
    username: string;
    avatar: string | null;
    rep_received: number;
    rep_given: number;
    is_official: boolean;
};

type EventData = {
    event_id: number;
    event_name: string;
    event_image: string | null;
    checkin_rep: number;
    total_rep: number;
    connections: Connection[];
    checked_in_at: string;
    reputation_earned: number;
    is_active: boolean;
};

const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
            ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
};

const avatarColor = (name: string) => {
    const colors = ['#7c3aed', '#db2777', '#059669', '#ea580c', '#2563eb'];
    return colors[(name.charCodeAt(0) || 0) % colors.length];
};

export const EventConnectionsSheet = forwardRef<EventConnectionsSheetRef>((_, ref) => {
    const router = useRouter();
    const sheetRef = React.useRef<BottomSheetModal>(null);
    const isDark = useColorScheme() === 'dark';
    const snapPoints = useMemo(() => ['75%', '95%'], []);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<EventData[]>([]);
    const [totalRep, setTotalRep] = useState(0);
    const [expanded, setExpanded] = useState<Record<number, boolean>>({});

    const bg = isDark ? '#0A0410' : '#F5F3FF';
    const card = isDark ? '#12091f' : '#FFFFFF';
    const main = isDark ? '#FFFFFF' : '#111827';
    const muted = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,24,39,0.45)';
    const divider = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const accent = '#A855F7';

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = await storage.getItem('access');
            const res = await axios.get(`${GetApiUrl()}/posts/user-event-connections/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setData(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useImperativeHandle(ref, () => ({
        present: (rep?: number) => {
            if (rep !== undefined) setTotalRep(rep);
            sheetRef.current?.present();
            fetchData();
        },
        dismiss: () => sheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.6}
                pressBehavior="close"
            />
        ),
        []
    );

    const totalRepCalc = totalRep || data.reduce((a, c) => a + (c.total_rep || 0), 0);

    return (
        <BottomSheetModal
            ref={sheetRef}
            index={0}
            snapPoints={snapPoints}
            backdropComponent={renderBackdrop}
            backgroundStyle={{ backgroundColor: bg }}
            handleIndicatorStyle={{ backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }}
        >
            <View style={[styles.sheetHeader, { borderBottomColor: divider }]}>
                <View>
                    <Text style={[styles.sheetTitle, { color: main }]}>My POAPs</Text>
                    <Text style={[styles.sheetSub, { color: muted }]}>Events you attended</Text>
                </View>
                <View style={styles.totalRepPill}>
                    <Star size={13} color="#22c55e" fill="#22c55e" />
                    <Text style={styles.totalRepTxt}>{totalRepCalc} rep</Text>
                </View>
            </View>

            {loading ? (
                <ActivityIndicator style={{ marginTop: 48 }} color={accent} />
            ) : data.length === 0 ? (
                <View style={styles.emptyWrap}>
                    <Text style={[styles.emptyIcon]}>🎟️</Text>
                    <Text style={[styles.emptyTitle, { color: main }]}>No POAPs yet</Text>
                    <Text style={[styles.emptySub, { color: muted }]}>
                        Attend events and claim your POAP to earn reputation.
                    </Text>
                </View>
            ) : (
                <BottomSheetScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
                >
                    {data.map((item) => {
                        const isExp = expanded[item.event_id];
                        const visible = isExp ? item.connections : item.connections.slice(0, 3);
                        const hidden = item.connections.length - 3;

                        return (
                            <View key={item.event_id} style={[styles.eventCard, { backgroundColor: card, borderColor: divider }]}>

                                {item.event_image ? (
                                    <View style={styles.heroWrap}>
                                        <FastImage source={{ uri: item.event_image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                                        <BlurView blurType={isDark ? 'dark' : 'light'} blurAmount={18} style={StyleSheet.absoluteFill} />
                                        <FastImage source={{ uri: item.event_image }} style={styles.heroImg} resizeMode="contain" />

                                        <View style={styles.heroBadgeRow}>
                                            <View style={styles.verifiedBadge}>
                                                <ShieldCheck size={11} color="#4ade80" strokeWidth={2.5} />
                                                <Text style={styles.verifiedTxt}>Attended</Text>
                                            </View>
                                            <View style={styles.repBadge}>
                                                <Star size={11} color="#fbbf24" fill="#fbbf24" />
                                                <Text style={styles.repBadgeTxt}>+{item.checkin_rep} rep</Text>
                                            </View>
                                        </View>
                                    </View>
                                ) : (
                                    <View style={[styles.heroPlaceholder, { backgroundColor: 'rgba(168,85,247,0.12)' }]}>
                                        <Text style={styles.heroPlaceholderEmoji}>🎟️</Text>
                                        <View style={styles.heroBadgeRow}>
                                            <View style={styles.verifiedBadge}>
                                                <ShieldCheck size={11} color="#4ade80" strokeWidth={2.5} />
                                                <Text style={styles.verifiedTxt}>Attended</Text>
                                            </View>
                                            <View style={styles.repBadge}>
                                                <Star size={11} color="#fbbf24" fill="#fbbf24" />
                                                <Text style={styles.repBadgeTxt}>+{item.reputation_earned} rep</Text>
                                            </View>
                                        </View>
                                    </View>
                                )}

                                <View style={styles.infoRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.eventName, { color: main }]} numberOfLines={1}>
                                            {item.event_name}
                                        </Text>
                                        <Text style={[styles.eventDate, { color: muted }]}>
                                            {formatDate(item.checked_in_at)}
                                        </Text>
                                    </View>
                                    <View style={[styles.cnftPill, { borderColor: 'rgba(168,85,247,0.3)', backgroundColor: 'rgba(168,85,247,0.1)' }]}>
                                        <Layers size={11} color={accent} />
                                        <Text style={[styles.cnftTxt, { color: accent }]}>cNFT</Text>
                                    </View>
                                </View>

                                {/* NFC Networking Button */}
                                {item.is_active && (
                                    <TouchableOpacity
                                        style={[styles.nfcBtn, { backgroundColor: accent }]}
                                        activeOpacity={0.8}
                                        onPress={() => {
                                            sheetRef.current?.dismiss();
                                            router.push(`/event-nfc-share?eventId=${item.event_id}`);
                                        }}
                                    >
                                        <Radio size={16} color="#ffffff" />
                                        <Text style={styles.nfcBtnTxt}>Network via NFC</Text>
                                    </TouchableOpacity>
                                )}

                                {item.connections.length > 0 && (
                                    <>
                                        <View style={[styles.divider, { backgroundColor: divider }]} />
                                        <View style={styles.connSection}>

                                            <View style={styles.connHeader}>
                                                <Users size={13} color={muted} />
                                                <Text style={[styles.connHeaderTxt, { color: muted }]}>
                                                    {item.connections.length} people you met
                                                </Text>
                                            </View>

                                            <View style={{ gap: 10, marginTop: 4 }}>
                                                {visible.map((c) => (
                                                    <View key={c.user_id} style={styles.connRow}>
                                                        {c.avatar ? (
                                                            <FastImage source={{ uri: c.avatar }} style={styles.connAvatar} />
                                                        ) : (
                                                            <View style={[styles.connAvatar, {
                                                                backgroundColor: avatarColor(c.username) + '20',
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }]}>
                                                                <Text style={[styles.connInitial, { color: avatarColor(c.username) }]}>
                                                                    {c.username.substring(0, 2).toUpperCase()}
                                                                </Text>
                                                            </View>
                                                        )}

                                                        <View style={styles.connNameWrap}>
                                                            <Text style={[styles.connName, { color: main }]} numberOfLines={1}>
                                                                {c.username}
                                                            </Text>
                                                            {c.is_official && (
                                                                <View style={{ marginLeft: 4 }}>
                                                                    <VerifyBadge isLooped={true} isVisible={true} haveModal={true} isStatic={false} size={15} />
                                                                </View>
                                                            )}
                                                        </View>

                                                        <View style={styles.connRepRow}>
                                                            {c.rep_received > 0 && (
                                                                <View style={styles.repReceivedBadge}>
                                                                    <Text style={styles.repReceivedTxt}>+{c.rep_received}</Text>
                                                                </View>
                                                            )}
                                                            {c.rep_given > 0 && (
                                                                <View style={styles.repGivenBadge}>
                                                                    <Text style={styles.repGivenTxt}>↑{c.rep_given}</Text>
                                                                </View>
                                                            )}
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>

                                            {item.connections.length > 3 && (
                                                <TouchableOpacity
                                                    onPress={() => setExpanded(p => ({ ...p, [item.event_id]: !p[item.event_id] }))}
                                                    style={[styles.expandBtn, {
                                                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'
                                                    }]}
                                                    activeOpacity={0.7}
                                                >
                                                    <ChevronDown
                                                        size={14} color={muted}
                                                        style={{ transform: [{ rotate: isExp ? '180deg' : '0deg' }] }}
                                                    />
                                                    <Text style={[styles.expandTxt, { color: muted }]}>
                                                        {isExp ? 'Show less' : `Show ${hidden} more`}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </>
                                )}
                            </View>
                        );
                    })}
                </BottomSheetScrollView>
            )}
        </BottomSheetModal>
    );
});

const styles = StyleSheet.create({
    sheetHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingBottom: 14, paddingTop: 4, borderBottomWidth: 1,
    },
    sheetTitle: { fontFamily: 'Dank Mono Bold', fontSize: 20, includeFontPadding: false },
    sheetSub: { fontFamily: 'Dank Mono', fontSize: 12, marginTop: 2, includeFontPadding: false },
    totalRepPill: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: 'rgba(34,197,94,0.12)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    },
    totalRepTxt: { fontFamily: 'Dank Mono Bold', fontSize: 13, color: '#22c55e', includeFontPadding: false },

    eventCard: { borderRadius: 20, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },

    heroWrap: { width: '100%', height: 180, position: 'relative' },
    heroImg: { width: '100%', height: '100%' },
    heroPlaceholder: {
        width: '100%', height: 100, alignItems: 'center', justifyContent: 'center', position: 'relative',
    },
    heroPlaceholderEmoji: { fontSize: 36, marginBottom: 8 },
    heroBadgeRow: {
        position: 'absolute', bottom: 10, left: 12, right: 12,
        flexDirection: 'row', justifyContent: 'space-between',
    },
    verifiedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20,
    },
    verifiedTxt: { fontFamily: 'Dank Mono Bold', fontSize: 11, color: '#4ade80', includeFontPadding: false },
    repBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20,
    },
    repBadgeTxt: { fontFamily: 'Dank Mono Bold', fontSize: 11, color: '#fbbf24', includeFontPadding: false },

    infoRow: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 10,
    },
    eventName: { fontFamily: 'Dank Mono Bold', fontSize: 16, includeFontPadding: false },
    eventDate: { fontFamily: 'Dank Mono', fontSize: 12, marginTop: 2, includeFontPadding: false },
    cnftPill: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 16,
    },
    cnftTxt: { fontFamily: 'Dank Mono Bold', fontSize: 11, includeFontPadding: false },

    // NFC Button Styles
    nfcBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginHorizontal: 16, marginBottom: 14, paddingVertical: 12, borderRadius: 12,
    },
    nfcBtnTxt: { fontFamily: 'Dank Mono Bold', fontSize: 14, color: '#ffffff', includeFontPadding: false },

    divider: { height: 1 },
    connSection: { padding: 14 },
    connHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    connHeaderTxt: { fontFamily: 'Dank Mono Bold', fontSize: 12, includeFontPadding: false },

    connRepRow: { flexDirection: 'row', gap: 6 },
    repReceivedBadge: { backgroundColor: 'rgba(34,197,94,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    repReceivedTxt: { fontFamily: 'Dank Mono Bold', fontSize: 10, color: '#22c55e' },
    repGivenBadge: { backgroundColor: 'rgba(168,85,247,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    repGivenTxt: { fontFamily: 'Dank Mono Bold', fontSize: 10, color: '#a855f7' },

    expandBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        marginTop: 12, paddingVertical: 10, borderRadius: 12,
    },
    expandTxt: { fontFamily: 'Dank Mono', fontSize: 13, includeFontPadding: false },

    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    emptyIcon: { fontSize: 48, marginBottom: 16 },
    emptyTitle: { fontFamily: 'Dank Mono Bold', fontSize: 18, marginBottom: 8, includeFontPadding: false },
    emptySub: { fontFamily: 'Dank Mono', fontSize: 14, textAlign: 'center', lineHeight: 21, includeFontPadding: false },
    connRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    connAvatar: { width: 38, height: 38, borderRadius: 19 },
    connInitial: { fontFamily: 'Dank Mono Bold', fontSize: 13, includeFontPadding: false },

    connNameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    connName: { fontFamily: 'Dank Mono Bold', fontSize: 14, flexShrink: 1, includeFontPadding: false },
});