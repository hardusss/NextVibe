import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    FlatListProps,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useColorScheme,
    useWindowDimensions,
} from "react-native";

import CollectibleCard from "@/components/Collectibles/CollectibleCard";
import CollectibleDetailSheet, { type CollectibleDetailSheetRef } from "@/components/Collectibles/CollectibleDetailSheet";
import { OgAvatarCard } from "@/components/ProfilePage/CollectionsMenu";
import {
    claimAllCollectibles,
    claimCollectible,
    CollectiblesApiError,
    listCollectibles,
    type Collectible,
    type CollectibleCounts,
    type CollectibleFilter,
    type CollectiblesSummary,
    type OgAvatarInfo,
} from "@/src/api/collectibles";
import setAvatar from "@/src/api/set.avatar";
import { startLanding, useCollectibles } from "@/src/stores/collectiblesStore";
import { openConnectWallet } from "@/src/stores/connectWalletStore";
import { applyUpdate, countFor, FILTERS, isPending, savedOffchainText } from "@/src/utils/collectibles";
import haptics from "@/src/utils/haptics";
import { colors, radius, space, type as typeScale } from "@/src/theme/tokens";

const PAGE = 24;
const PENDING_POLL_MS = 5000;
const PENDING_POLL_ROUNDS = 24;
const GUTTER = space.md;
const EDGE = space.lg;

interface TabData {
    items: Collectible[];
    cursor: string | null;
    counts?: CollectibleCounts;
    og?: OgAvatarInfo | null;
    external: Collectible[];
    summary?: CollectiblesSummary;
}

// Per profile and filter, to survive tab switches (like the posts grid)
const tabCache = new Map<string, TabData>();
const cacheKey = (username: string, filter: CollectibleFilter) => `${username}:${filter}`;

export const clearCollectiblesTabCache = () => tabCache.clear();

interface Props {
    username: string;
    isOwnProfile?: boolean;
    ListHeaderComponent?: FlatListProps<Collectible>["ListHeaderComponent"];
    ListEmptyComponent?: FlatListProps<Collectible>["ListEmptyComponent"];
    refreshControl?: FlatListProps<Collectible>["refreshControl"];
    contentInset?: FlatListProps<Collectible>["contentInset"];
    contentOffset?: FlatListProps<Collectible>["contentOffset"];
    contentInsetAdjustmentBehavior?: FlatListProps<Collectible>["contentInsetAdjustmentBehavior"];
    automaticallyAdjustContentInsets?: FlatListProps<Collectible>["automaticallyAdjustContentInsets"];
    /** The total this tab lists, for the profile's "Collectibles (N)" label. */
    onCount?: (total: number) => void;
}

/**
 * The profile's cNFT tab: everything from the collectibles table (on Solana
 * or not, the same card for both), newest first, with All · POAPs · Proof of
 * Meet · Collected. The owner also gets "N saved off-chain · Claim all", the
 * Claim buttons, and whatever else their wallet holds (DAS) at the end.
 * Visible with or without a wallet.
 */
export default function CollectiblesTab({
    username,
    isOwnProfile = false,
    ListHeaderComponent,
    ListEmptyComponent,
    refreshControl,
    contentInset,
    contentOffset,
    contentInsetAdjustmentBehavior,
    automaticallyAdjustContentInsets,
    onCount,
}: Props) {
    const isDark = useColorScheme() === "dark";
    const { width } = useWindowDimensions();
    const cardWidth = Math.floor((width - EDGE * 2 - GUTTER) / 2);
    const [filter, setFilter] = useState<CollectibleFilter>("all");
    const [data, setData] = useState<TabData | null>(() => tabCache.get(cacheKey(username, "all")) ?? null);
    const [loading, setLoading] = useState(!data);
    const [loadingMore, setLoadingMore] = useState(false);
    const [claimingAll, setClaimingAll] = useState(false);
    const fetching = useRef(false);
    const filterRef = useRef(filter);
    filterRef.current = filter;
    const sheetRef = useRef<CollectibleDetailSheetRef>(null);
    const updates = useCollectibles((s) => s.updates);
    const summary = useCollectibles((s) => (isOwnProfile ? s.summary : null));
    const landing = useCollectibles((s) => s.landing);

    const load = useCallback(async (which: CollectibleFilter, more = false) => {
        if (!username || fetching.current) return;
        const key = cacheKey(username, which);
        const current = tabCache.get(key);
        if (more && (!current || !current.cursor)) return;
        fetching.current = true;
        if (more) setLoadingMore(true);
        else if (!current) setLoading(true);
        try {
            const page = await listCollectibles(username, { kind: which, cursor: more ? current!.cursor : null, limit: PAGE });
            const next: TabData = more && current
                ? { ...current, items: dedupe([...current.items, ...page.items]), cursor: page.next_cursor }
                : {
                    items: page.items,
                    cursor: page.next_cursor,
                    counts: page.counts,
                    og: page.og_avatar ?? null,
                    external: page.external ?? [],
                    summary: page.summary,
                };
            tabCache.set(key, next);
            useCollectibles.getState().dropUpdates(page.items.map((i) => i.id));
            if (!more && page.summary) useCollectibles.getState().setSummary(page.summary);
            setData((shown) => (which === filterRef.current ? next : shown));
        } catch {
            // Keep what's shown; pull to refresh tries again
        } finally {
            fetching.current = false;
            setLoading(false);
            setLoadingMore(false);
        }
    }, [username]);

    useEffect(() => {
        const cached = tabCache.get(cacheKey(username, filter));
        setData(cached ?? null);
        if (!cached) {
            setLoading(true);
            load(filter);
        }
    }, [username, filter, load]);

    // The profile label follows this tab: a check-in or a meet made since the
    // profile loaded shows in "Collectibles (N)" without a refetch
    const total = data?.counts?.all;
    const onCountRef = useRef(onCount);
    onCountRef.current = onCount;
    useEffect(() => {
        if (typeof total === "number") onCountRef.current?.(total);
    }, [total]);

    // A wallet connect queued everything: the cards turn to "Minting…" right
    // away instead of still offering Claim, and come back fresh once the
    // batch has landed. The shown filter reloads in place; the others refetch
    // when opened.
    useEffect(() => {
        if (!landing || !isOwnProfile) return;
        for (const key of FILTERS.map((f) => f.key)) {
            if (key !== filterRef.current) tabCache.delete(cacheKey(username, key));
        }
        load(filterRef.current);
    }, [landing?.startedAt, landing?.done]);

    // Something of mine is on its way: check back now and then, in case a
    // socket event is missed (the app was in the background, say)
    const anyPending = isOwnProfile && !!data?.items.some((i) => isPending(applyUpdate(i, updates[String(i.id)])));
    useEffect(() => {
        if (!anyPending) return;
        let rounds = 0;
        const timer = setInterval(() => {
            if (++rounds > PENDING_POLL_ROUNDS) return clearInterval(timer);
            load(filterRef.current);
        }, PENDING_POLL_MS);
        return () => clearInterval(timer);
    }, [anyPending, username, load]);

    const handleClaim = useCallback(async (item: Collectible) => {
        if (typeof item.id !== "number") return;
        if (summary && !summary.has_wallet) {
            openConnectWallet("claim");
            return;
        }
        useCollectibles.getState().markPending(item.id);
        try {
            const { collectible } = await claimCollectible(item.id);
            useCollectibles.getState().applyEvent({ type: "collectible", id: item.id, status: collectible.status ?? "queued",
                asset_id: collectible.asset_id });
        } catch (e) {
            // Back to how it was; no wallet opens the connect sheet
            useCollectibles.getState().applyEvent({ type: "collectible", id: item.id, status: item.status ?? "offchain" });
            if (e instanceof CollectiblesApiError && e.code === "no_wallet") openConnectWallet("claim");
            else haptics.notification("error");
        }
    }, [summary]);

    const handleClaimAll = useCallback(async () => {
        if (claimingAll) return;
        if (summary && !summary.has_wallet) {
            openConnectWallet("claim_all");
            return;
        }
        setClaimingAll(true);
        try {
            const { queued, summary: next } = await claimAllCollectibles();
            useCollectibles.getState().setSummary(next);
            if (queued > 0) startLanding(queued);
            haptics.notification("success");
        } catch (e) {
            if (e instanceof CollectiblesApiError && e.code === "no_wallet") openConnectWallet("claim_all");
            else haptics.notification("error");
        } finally {
            setClaimingAll(false);
        }
    }, [claimingAll, summary]);

    const items = useMemo(() => {
        if (!data) return [];
        // The pinned OG card is the badge; don't show it twice
        const own = data.og ? data.items.filter((i) => i.kind !== "badge") : data.items;
        const live = own.map((i) => applyUpdate(i, updates[String(i.id)]));
        // Other things in the wallet go last, once our own are all in
        return filter === "all" && !data.cursor ? [...live, ...data.external] : live;
    }, [data, updates, filter]);

    const claimable = isOwnProfile ? (summary?.claimable ?? data?.summary?.claimable ?? 0) : 0;
    const main = isDark ? colors.text : "#111827";
    const muted = isDark ? colors.sub : "rgba(17,24,39,0.55)";

    const header = (
        <>
            {ListHeaderComponent as React.ReactNode}
            {data?.og ? (
                <OgAvatarCard
                    og={data.og}
                    isDark={isDark}
                    isOwnProfile={isOwnProfile}
                    onSetAvatar={async () => { await setAvatar(data.og!.image_url); }}
                />
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                {FILTERS.map(({ key, label }) => {
                    const active = key === filter;
                    const count = countFor(tabCache.get(cacheKey(username, "all"))?.counts, key);
                    return (
                        <Pressable
                            key={key}
                            onPress={() => { if (!active) { haptics.selection(); setFilter(key); } }}
                            style={[styles.filter, {
                                backgroundColor: active ? "rgba(168,85,247,0.2)" : isDark ? "rgba(255,255,255,0.05)" : "rgba(17,24,39,0.05)",
                                borderColor: active ? "rgba(168,85,247,0.55)" : "transparent",
                            }]}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: active }}
                        >
                            <Text style={[styles.filterText, { color: active ? (isDark ? "#E9D5FF" : colors.accentDeep) : muted }]}>
                                {count === null ? label : `${label} ${count}`}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
            {claimable > 0 && (
                <View style={[styles.claimAll, { borderColor: isDark ? colors.border : "rgba(17,24,39,0.08)" }]}>
                    <Text style={[styles.claimAllText, { color: main }]} numberOfLines={1}>{savedOffchainText(claimable)}</Text>
                    <Pressable onPress={handleClaimAll} disabled={claimingAll} hitSlop={8} accessibilityRole="button"
                        style={({ pressed }) => [styles.claimAllButton, { opacity: pressed || claimingAll ? 0.7 : 1 }]}>
                        {claimingAll
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.claimAllButtonText}>Claim all</Text>}
                    </Pressable>
                </View>
            )}
        </>
    );

    return (
        <View style={styles.container}>
            <FlatList
                data={loading ? [] : items}
                keyExtractor={(item) => String(item.id)}
                numColumns={2}
                columnWrapperStyle={styles.row}
                renderItem={({ item }) => (
                    <CollectibleCard
                        item={item}
                        width={cardWidth}
                        onPress={(i) => sheetRef.current?.present(i)}
                        onClaim={isOwnProfile && item.kind !== "external" ? handleClaim : undefined}
                    />
                )}
                ListHeaderComponent={header}
                ListEmptyComponent={loading
                    ? <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: space.xl }} />
                    : (ListEmptyComponent as React.ReactElement)}
                ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: space.md }} /> : null}
                onEndReached={() => load(filter, true)}
                onEndReachedThreshold={0.8}
                initialNumToRender={8}
                windowSize={7}
                removeClippedSubviews={Platform.OS === "android"}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: 250 }}
                refreshControl={refreshControl}
                contentInset={contentInset}
                contentOffset={contentOffset}
                contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
                automaticallyAdjustContentInsets={automaticallyAdjustContentInsets}
                showsVerticalScrollIndicator={false}
            />
            <CollectibleDetailSheet ref={sheetRef} onClaim={isOwnProfile ? handleClaim : undefined} />
        </View>
    );
}

function dedupe(items: Collectible[]): Collectible[] {
    const seen = new Set<string>();
    return items.filter((i) => (seen.has(String(i.id)) ? false : (seen.add(String(i.id)), true)));
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    row: {
        paddingHorizontal: EDGE,
        gap: GUTTER,
        marginBottom: GUTTER,
    },
    filters: {
        paddingHorizontal: EDGE,
        gap: space.sm,
        paddingBottom: space.md,
    },
    filter: {
        paddingHorizontal: space.md,
        paddingVertical: 7,
        borderRadius: radius.pill,
        borderWidth: 1,
    },
    filterText: {
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.caption,
        includeFontPadding: false,
    },
    claimAll: {
        marginHorizontal: EDGE,
        marginBottom: space.md,
        paddingLeft: space.md,
        paddingRight: space.xs,
        paddingVertical: space.xs,
        borderRadius: radius.md,
        borderWidth: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
    },
    claimAllText: {
        flex: 1,
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.caption + 1,
        includeFontPadding: false,
    },
    claimAllButton: {
        minWidth: 92,
        minHeight: 34,
        paddingHorizontal: space.md,
        borderRadius: radius.sm,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
    },
    claimAllButtonText: {
        color: "#FFFFFF",
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.caption,
        includeFontPadding: false,
    },
});
