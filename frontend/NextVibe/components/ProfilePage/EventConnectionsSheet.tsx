import React, { useCallback, useMemo, forwardRef, useState, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, useColorScheme, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import VerifyBadge from "../VerifyBadge";
import { Star, Layers, Users, ChevronDown, ShieldCheck, Radio, Award, MessageSquare, Mail, UserPlus, Sparkles } from 'lucide-react-native';
import axios from 'axios';
import { storage } from '@/src/utils/storage';
import GetApiUrl from '@/src/utils/url_api';
import { useRouter } from 'expo-router';

export interface EventConnectionsSheetRef {
    present: (totalRep?: number, userId?: number) => void;
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

export type ReputationItem = {
    id: string;
    type: 'cherry_invite_code' | 'event_post' | 'email_verification' | 'invite_reward' | 'event_checkin' | 'networking' | 'generic';
    title: string;
    description: string;
    points: number;
    date: string;
    image?: string | null;
    post_id?: number | null;
    event_id?: number | null;
    icon?: string;
    badge_color?: string;
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
    const [activeTab, setActiveTab] = useState<'history' | 'poaps'>('history');
    const [data, setData] = useState<EventData[]>([]);
    const [repItems, setRepItems] = useState<ReputationItem[]>([]);
    const [totalRep, setTotalRep] = useState(0);
    const [expanded, setExpanded] = useState<Record<number, boolean>>({});

    const bg = isDark ? '#0A0410' : '#F5F3FF';
    const card = isDark ? '#12091f' : '#FFFFFF';
    const main = isDark ? '#FFFFFF' : '#111827';
    const muted = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,24,39,0.45)';
    const divider = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const accent = '#A855F7';

    const fetchData = async (userId?: number) => {
        setLoading(true);
        try {
            const token = await storage.getItem('access');
            const url = userId
                ? `${GetApiUrl()}/posts/user-event-connections/?user_id=${userId}`
                : `${GetApiUrl()}/posts/user-event-connections/`;
            const res = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            if (Array.isArray(res.data)) {
                setData(res.data);
                setRepItems([]);
            } else if (res.data && typeof res.data === 'object') {
                setData(res.data.events || []);
                setRepItems(res.data.reputation_items || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useImperativeHandle(ref, () => ({
        present: (rep?: number, userId?: number) => {
            if (rep !== undefined) setTotalRep(rep);
            sheetRef.current?.present();
            fetchData(userId);
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

    const totalRepCalc = totalRep || (
        repItems.length > 0 
            ? repItems.reduce((acc, curr) => acc + (curr.points || 0), 0)
            : data.reduce((a, c) => a + (c.total_rep || 0), 0)
    );

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
                    <Text style={[styles.sheetTitle, { color: main }]}>Reputation & POAPs</Text>
                    <Text style={[styles.sheetSub, { color: muted }]}>Activity breakdown & rewards</Text>
                </View>
                <View style={styles.totalRepPill}>
                    <Star size={13} color="#22c55e" fill="#22c55e" />
                    <Text style={styles.totalRepTxt}>{totalRepCalc} rep</Text>
                </View>
            </View>

            {/* Segmented Tab Switcher */}
            <View style={[styles.tabBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setActiveTab('history')}
                    style={[
                        styles.tabItem,
                        activeTab === 'history' && { backgroundColor: isDark ? '#231035' : '#FFFFFF', borderColor: '#A855F766', borderWidth: 1 }
                    ]}
                >
                    <Sparkles size={14} color={activeTab === 'history' ? '#A855F7' : muted} />
                    <Text style={[styles.tabTxt, { color: activeTab === 'history' ? main : muted }]}>
                        Reputation Breakdown ({repItems.length})
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setActiveTab('poaps')}
                    style={[
                        styles.tabItem,
                        activeTab === 'poaps' && { backgroundColor: isDark ? '#231035' : '#FFFFFF', borderColor: '#A855F766', borderWidth: 1 }
                    ]}
                >
                    <Award size={14} color={activeTab === 'poaps' ? '#A855F7' : muted} />
                    <Text style={[styles.tabTxt, { color: activeTab === 'poaps' ? main : muted }]}>
                        POAPs & Events ({data.length})
                    </Text>
                </TouchableOpacity>
            </View>

            <BottomSheetScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={
                    loading || (activeTab === 'poaps' ? data.length === 0 : repItems.length === 0)
                        ? { flexGrow: 1 }
                        : { padding: 16, paddingBottom: 48 }
                }
            >
                {loading ? (
                    <ActivityIndicator style={{ marginTop: 48 }} color={accent} />
                ) : activeTab === 'history' ? (
                    // REPUTATION BREAKDOWN TAB
                    repItems.length === 0 ? (
                        <View style={styles.emptyWrap}>
                            <Text style={[styles.emptyIcon]}>⭐</Text>
                            <Text style={[styles.emptyTitle, { color: main }]}>No Reputation Activity Yet</Text>
                            <Text style={[styles.emptySub, { color: muted }]}>
                                Post at events, claim Cherry invite bonuses, verify your email or meet people IRL to earn reputation.
                            </Text>
                        </View>
                    ) : (
                        repItems.map((item) => {
                            const badgeColor = item.badge_color || '#A855F7';
                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    activeOpacity={item.post_id ? 0.7 : 1}
                                    onPress={() => {
                                        if (item.post_id) {
                                            sheetRef.current?.dismiss();
                                            router.push(`/post-details?id=${item.post_id}` as any);
                                        }
                                    }}
                                    style={[styles.repCard, { backgroundColor: card, borderColor: divider }]}
                                >
                                    <View style={styles.repCardHeader}>
                                        <View style={[styles.iconCircle, { backgroundColor: badgeColor + '22', borderColor: badgeColor + '55' }]}>
                                            <Text style={{ fontSize: 18 }}>{item.icon || '⭐'}</Text>
                                        </View>

                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <Text style={[styles.repTitle, { color: main }]} numberOfLines={1}>
                                                    {item.title}
                                                </Text>
                                                <View style={[styles.pointsBadge, { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.3)' }]}>
                                                    <Star size={10} color="#22c55e" fill="#22c55e" />
                                                    <Text style={styles.pointsTxt}>+{item.points} REP</Text>
                                                </View>
                                            </View>

                                            <Text style={[styles.repDesc, { color: muted }]}>
                                                {item.description}
                                            </Text>
                                            <Text style={[styles.repDate, { color: muted }]}>
                                                {formatDate(item.date)}
                                            </Text>
                                        </View>
                                    </View>

                                    {item.image && (
                                        <View style={styles.repImageWrap}>
                                            <Image source={{ uri: item.image }} style={styles.repImage} contentFit="cover" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })
                    )
                ) : (
                    // POAPs & EVENTS TAB
                    data.length === 0 ? (
                        <View style={styles.emptyWrap}>
                            <Text style={[styles.emptyIcon]}>🎟️</Text>
                            <Text style={[styles.emptyTitle, { color: main }]}>No POAPs yet</Text>
                            <Text style={[styles.emptySub, { color: muted }]}>
                                Attend events and claim your POAP to earn reputation.
                            </Text>
                        </View>
                    ) : (
                        data.map((item) => {
                            const isExp = expanded[item.event_id];
                            const visible = isExp ? item.connections : item.connections.slice(0, 3);
                            const hidden = item.connections.length - 3;

                            return (
                                <View key={item.event_id} style={[styles.eventCard, { backgroundColor: card, borderColor: divider }]}>

                                    {item.event_image ? (
                                        <View style={styles.heroWrap}>
                                            <Image source={{ uri: item.event_image }} style={StyleSheet.absoluteFill} contentFit="cover" />
                                            <BlurView tint={isDark ? 'dark' : 'light'} intensity={45} experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} pointerEvents="none" />
                                            <Image source={{ uri: item.event_image }} style={styles.heroImg} contentFit="contain" />

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

                                    {/* Networking Button — NFC on Android, BLE on iOS */}
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
                                            <Text style={styles.nfcBtnTxt}>
                                                {Platform.OS === 'ios' ? 'Network via BLE' : 'Network via NFC'}
                                            </Text>
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
                                                                <Image source={{ uri: c.avatar }} style={styles.connAvatar} />
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
                        })
                    )
                )}
            </BottomSheetScrollView>
        </BottomSheetModal>
    );
});

const styles = StyleSheet.create({
    sheetHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingBottom: 12, paddingTop: 4, borderBottomWidth: 1,
    },
    sheetTitle: { fontFamily: 'Dank Mono Bold', fontSize: 20, includeFontPadding: false },
    sheetSub: { fontFamily: 'Dank Mono', fontSize: 12, marginTop: 2, includeFontPadding: false },
    totalRepPill: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: 'rgba(34,197,94,0.12)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    },
    totalRepTxt: { fontFamily: 'Dank Mono Bold', fontSize: 13, color: '#22c55e', includeFontPadding: false },

    tabBar: {
        flexDirection: 'row', padding: 4, marginHorizontal: 16, marginTop: 12, borderRadius: 14, gap: 6,
    },
    tabItem: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 9, borderRadius: 10,
    },
    tabTxt: { fontFamily: 'Dank Mono Bold', fontSize: 12, includeFontPadding: false },

    repCard: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12 },
    repCardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
    iconCircle: {
        width: 40, height: 40, borderRadius: 20, borderWidth: 1,
        alignItems: 'center', justifyContent: 'center',
    },
    repTitle: { fontFamily: 'Dank Mono Bold', fontSize: 15, flex: 1, marginRight: 8, includeFontPadding: false },
    repDesc: { fontFamily: 'Dank Mono', fontSize: 13, marginTop: 3, includeFontPadding: false },
    repDate: { fontFamily: 'Dank Mono', fontSize: 11, marginTop: 4, includeFontPadding: false },
    pointsBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1,
    },
    pointsTxt: { fontFamily: 'Dank Mono Bold', fontSize: 11, color: '#22c55e', includeFontPadding: false },
    repImageWrap: { marginTop: 10, borderRadius: 12, overflow: 'hidden', height: 120, width: '100%' },
    repImage: { width: '100%', height: '100%' },

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