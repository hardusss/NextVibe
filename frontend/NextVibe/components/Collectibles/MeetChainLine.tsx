import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { claimCollectible, CollectiblesApiError, type CollectibleStatus } from "@/src/api/collectibles";
import { useCollectibles } from "@/src/stores/collectiblesStore";
import { openConnectWallet } from "@/src/stores/connectWalletStore";
import { chainLine, isPending, NOT_ON_SOLANA, shortAddress } from "@/src/utils/collectibles";
import haptics from "@/src/utils/haptics";
import { colors, space } from "@/src/theme/tokens";

/** Each person's Proof of Meet collectible, as a post payload lists them (`meet_collectibles`). */
export interface MeetCollectibleState {
    id: number;
    user_id: number;
    onchain: boolean;
    asset_id: string | null;
    /** Only on the viewer's own entry */
    status?: CollectibleStatus;
    can_claim?: boolean;
}

/**
 * Under a Proof of Meet post: "On Solana · 8xK…3fQ", or "Not on Solana yet"
 * with Claim when it's the viewer's own. The same record as the cNFT tab's
 * card (linked by the meet's slug). Shows the viewer's own copy when they're
 * one of the two, otherwise the post owner's.
 */
export default function MeetChainLine({ items, ownerId, mutedColor }: {
    items: MeetCollectibleState[] | null | undefined;
    ownerId: number;
    mutedColor: string;
}) {
    const summary = useCollectibles((s) => s.summary);
    const [claiming, setClaiming] = useState(false);
    const own = items?.find((i) => i.status !== undefined) ?? null;
    const shown = own ?? items?.find((i) => i.user_id === ownerId) ?? items?.[0] ?? null;
    const update = useCollectibles((s) => (shown ? s.updates[String(shown.id)] : undefined));
    if (!shown) return null;

    const status = update?.status ?? shown.status;
    const live = {
        onchain: status ? status === "minted" : shown.onchain,
        asset_id: update?.asset_id ?? shown.asset_id,
        status,
    };
    const mine = shown === own;
    const pending = mine && (claiming || isPending(live));
    const claimable = mine && !pending && (status === "offchain" || status === "failed");

    const claim = async () => {
        if (summary && !summary.has_wallet) {
            openConnectWallet("claim");
            return;
        }
        haptics.impact("light");
        setClaiming(true);
        useCollectibles.getState().markPending(shown.id);
        try {
            const { collectible } = await claimCollectible(shown.id);
            useCollectibles.getState().applyEvent({ type: "collectible", id: shown.id, status: collectible.status ?? "queued",
                asset_id: collectible.asset_id });
        } catch (e) {
            useCollectibles.getState().applyEvent({ type: "collectible", id: shown.id, status: status ?? "offchain" });
            if (e instanceof CollectiblesApiError && e.code === "no_wallet") openConnectWallet("claim");
        } finally {
            setClaiming(false);
        }
    };

    return (
        <View style={styles.row} testID="meet-chain-line">
            {pending ? (
                <>
                    <ActivityIndicator size="small" color={mutedColor} style={styles.spinner} />
                    <Text style={[styles.text, { color: mutedColor }]}>Putting it on Solana…</Text>
                </>
            ) : live.onchain && live.asset_id ? (
                <Text style={[styles.text, { color: mutedColor }]} accessibilityLabel={`On Solana, ${shortAddress(live.asset_id)}`}>
                    {chainLine(live)}
                </Text>
            ) : (
                <>
                    <Text style={[styles.text, { color: mutedColor }]}>{NOT_ON_SOLANA}</Text>
                    {claimable && (
                        <>
                            <Text style={[styles.text, { color: mutedColor }]}> · </Text>
                            <Pressable onPress={claim} hitSlop={10} accessibilityRole="button">
                                <Text style={[styles.text, styles.claim]}>{status === "failed" ? "Try again" : "Claim"}</Text>
                            </Pressable>
                        </>
                    )}
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 2,
    },
    text: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        includeFontPadding: false,
    },
    claim: {
        color: colors.accent,
        fontFamily: "Dank Mono Bold",
    },
    spinner: {
        marginRight: space.xs,
        transform: [{ scale: 0.6 }],
    },
});
