import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, FlatList, RefreshControl, StatusBar, StyleSheet, Text, TouchableOpacity, View, useColorScheme,
} from 'react-native';
import { ArrowLeft, Camera } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';

import ConfirmDialog from '@/components/Shared/Toasts/ConfirmDialog';
import { TAKEDOWN_MESSAGE, TAKEDOWN_TITLE } from '@/components/Meet/takedownCopy';
import { getMyMeetPhotos, takeDownMeetPhoto, type MeetPhotoListItem } from '@/src/api/meetPhoto';
import { bumpMeetPhoto } from '@/src/stores/meetPhotoStore';
import haptics from '@/src/utils/haptics';

const STATUS_LABEL: Record<string, string> = {
    pending: 'Waiting for an answer',
    approved: 'Minting…',
    minted: 'Live',
    taken_down: 'Removed',
};

/**
 * Settings → Proof of Meet: every selfie you're in. Either of the two people
 * can remove one at any time. Someone you blocked stays anonymous here.
 */
export default function MeetPhotosSettings() {
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [items, setItems] = useState<MeetPhotoListItem[]>([]);
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [refreshing, setRefreshing] = useState(false);
    const [confirm, setConfirm] = useState<MeetPhotoListItem | null>(null);
    const [removing, setRemoving] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const { data } = await getMyMeetPhotos();
            setItems(data);
            setState('ready');
        } catch {
            setState((prev) => (prev === 'ready' ? prev : 'error'));
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const remove = async (item: MeetPhotoListItem) => {
        setConfirm(null);
        setRemoving(item.slug);
        setNote(null);
        try {
            await takeDownMeetPhoto(item.slug);
            haptics.notification('success');
            bumpMeetPhoto(item.slug);
            setItems((prev) => prev.map((p) => (p.slug === item.slug ? { ...p, status: 'taken_down', preview_url: null } : p)));
            setNote('The photo was removed.');
        } catch (error: any) {
            haptics.notification('error');
            setNote(error?.message ?? "Couldn't remove the photo. Try again.");
        } finally {
            setRemoving(null);
        }
    };

    const c = {
        bg: isDark ? '#0A0410' : '#FFFFFF',
        card: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
        border: isDark ? 'rgba(168,85,247,0.12)' : 'rgba(0,0,0,0.06)',
        text: isDark ? '#FFFFFF' : '#1A1225',
        sub: isDark ? 'rgba(255,255,255,0.55)' : '#64748B',
        accent: isDark ? '#a855f7' : '#7C3AED',
        soft: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    };

    const renderItem = ({ item }: { item: MeetPhotoListItem }) => {
        const removable = item.status !== 'taken_down';
        const name = item.other ? `@${item.other.username}` : 'Hidden account';
        return (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
                {item.preview_url ? (
                    <Image source={{ uri: item.preview_url }} style={[styles.thumb, { backgroundColor: c.soft }]} contentFit="cover" />
                ) : (
                    <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: c.soft }]}>
                        <Camera size={20} color={c.sub} />
                    </View>
                )}
                <View style={styles.body}>
                    <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                        {item.role === 'photographer' ? `You with ${name}` : `${name} with you`}
                    </Text>
                    <Text style={[styles.meta, { color: c.sub }]} numberOfLines={1}>
                        {STATUS_LABEL[item.status] ?? item.status} · {new Date(item.created_at).toLocaleDateString()}
                    </Text>
                </View>
                {removable && (
                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: c.soft, borderColor: c.border }, removing === item.slug && { opacity: 0.6 }]}
                        onPress={() => setConfirm(item)}
                        disabled={!!removing}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove the photo with ${name}`}
                    >
                        {removing === item.slug
                            ? <ActivityIndicator size="small" color={c.accent} />
                            : <Text style={[styles.buttonText, { color: '#F87171' }]}>Remove photo</Text>}
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: c.bg }]}>
            <StatusBar backgroundColor={c.bg} barStyle={isDark ? 'light-content' : 'dark-content'} />
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity style={[styles.back, { backgroundColor: c.card }]} onPress={() => router.back()} activeOpacity={0.8}
                    accessibilityRole="button" accessibilityLabel="Back">
                    <ArrowLeft size={22} color={c.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>Proof of Meet</Text>
                <View style={{ width: 44 }} />
            </View>
            {note && <Text style={[styles.note, { color: c.sub }]} accessibilityLiveRegion="polite">{note}</Text>}
            {state === 'loading' ? (
                <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={renderItem}
                    contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}
                            tintColor={c.text} colors={[c.accent]} progressBackgroundColor={c.bg} />
                    }
                    ListHeaderComponent={
                        <Text style={[styles.intro, { color: c.sub }]}>
                            Selfies you took with people you met. Either of you can remove one at any time.
                        </Text>
                    }
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={[styles.emptyTitle, { color: c.text }]}>
                                {state === 'error' ? "Couldn't load your photos" : 'No Proof of Meet photos yet'}
                            </Text>
                            <Text style={[styles.meta, { color: c.sub, textAlign: 'center' }]}>
                                {state === 'error' ? 'Check your connection and try again.'
                                    : 'After a tap, take a selfie together and it shows up here.'}
                            </Text>
                        </View>
                    }
                />
            )}
            <ConfirmDialog
                visible={!!confirm}
                title={TAKEDOWN_TITLE}
                message={TAKEDOWN_MESSAGE}
                confirmLabel="Remove photo"
                onConfirm={() => confirm && remove(confirm)}
                onCancel={() => setConfirm(null)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    title: {
        flex: 1,
        fontSize: 18,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        textAlign: 'center',
        marginHorizontal: 8,
    },
    intro: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        lineHeight: 19,
        marginHorizontal: 20,
        marginBottom: 8,
        includeFontPadding: false,
    },
    note: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        textAlign: 'center',
        marginBottom: 6,
        includeFontPadding: false,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginVertical: 5,
        padding: 12,
        borderRadius: 20,
        borderWidth: 1,
    },
    thumb: { width: 48, height: 60, borderRadius: 10 },
    thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, marginLeft: 12, marginRight: 10, gap: 4 },
    name: { fontSize: 15, fontFamily: 'Dank Mono Bold', includeFontPadding: false },
    meta: { fontSize: 12, fontFamily: 'Dank Mono', includeFontPadding: false },
    button: {
        minWidth: 108,
        height: 34,
        borderRadius: 17,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    buttonText: { fontSize: 13, fontFamily: 'Dank Mono Bold', includeFontPadding: false },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8, paddingTop: 60 },
    emptyTitle: { fontSize: 17, fontFamily: 'Dank Mono Bold', includeFontPadding: false, textAlign: 'center' },
});
