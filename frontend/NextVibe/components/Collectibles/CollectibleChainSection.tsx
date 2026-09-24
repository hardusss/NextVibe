import React, { useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, ExternalLink } from "lucide-react-native";

import EventCta from "@/components/Events/EventCta";
import type { Collectible } from "@/src/api/collectibles";
import {
    FAILED_TEXT,
    formatDate,
    isPending,
    NOT_ON_SOLANA,
    recordedLine,
    shortAddress,
    showsClaim,
    statusOf,
} from "@/src/utils/collectibles";
import haptics from "@/src/utils/haptics";
import { colors, space, type as typeScale } from "@/src/theme/tokens";

/**
 * The detail sheet's chain section, the only part that differs on-chain or
 * not. On Solana: the asset id (short, copyable), the mint date, "View on
 * Solana" and the owner's wallet. Not yet: "Recorded on NextVibe · <date>"
 * and, for the owner, "Claim to put this on Solana" with Claim. Never an
 * empty field, an "N/A" or a made-up id.
 */
export default function CollectibleChainSection({ item, onClaim }: {
    item: Collectible;
    /** The owner's Claim / Try again; absent on someone else's profile. */
    onClaim?: (item: Collectible) => void;
}) {
    const isDark = useColorScheme() === "dark";
    const [copied, setCopied] = useState(false);
    const main = isDark ? colors.text : "#111827";
    const muted = isDark ? colors.sub : "rgba(17,24,39,0.6)";
    const faint = isDark ? colors.muted : "rgba(17,24,39,0.45)";
    const line = isDark ? colors.border : "rgba(17,24,39,0.08)";
    const status = statusOf(item);

    const copyAsset = async () => {
        if (!item.asset_id) return;
        await Clipboard.setStringAsync(item.asset_id);
        haptics.selection();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (item.onchain) {
        return (
            <View testID="chain-onchain">
                {!!item.asset_id && (
                    <Row label="Asset ID" muted={muted} line={line}>
                        <Pressable onPress={copyAsset} hitSlop={8} style={styles.inline} accessibilityRole="button"
                            accessibilityLabel="Copy asset ID">
                            <Text style={[styles.value, { color: main }]}>{shortAddress(item.asset_id)}</Text>
                            {copied ? <Check size={14} color={colors.success} /> : <Copy size={14} color={faint} />}
                        </Pressable>
                    </Row>
                )}
                {!!item.minted_at && (
                    <Row label="Minted" muted={muted} line={line}>
                        <Text style={[styles.value, { color: main }]}>
                            {formatDate(item.minted_at)}{item.claimed_later ? " · claimed later" : ""}
                        </Text>
                    </Row>
                )}
                {!!item.wallet && (
                    <Row label="Owner wallet" muted={muted} line={line}>
                        <Text style={[styles.value, { color: main }]}>{shortAddress(item.wallet)}</Text>
                    </Row>
                )}
                {!!item.explorer_url && (
                    <View style={styles.cta}>
                        <EventCta
                            label="View on Solana"
                            variant="secondary"
                            icon={<ExternalLink size={16} color={main} />}
                            onPress={() => Linking.openURL(item.explorer_url!).catch(() => { })}
                        />
                    </View>
                )}
            </View>
        );
    }

    const mine = item.status !== undefined;
    return (
        <View testID="chain-offchain" style={styles.offchain}>
            <Text style={[styles.recorded, { color: main }]}>{recordedLine(item)}</Text>
            {mine && isPending(item) ? (
                <View style={styles.inline}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={[styles.note, { color: muted }]}>Putting it on Solana…</Text>
                </View>
            ) : onClaim && showsClaim(item) ? (
                <>
                    <Text style={[styles.note, { color: muted }]}>
                        {status === "failed" ? FAILED_TEXT : "Claim to put this on Solana"}
                    </Text>
                    <View style={styles.cta}>
                        <EventCta label={status === "failed" ? "Try again" : "Claim"} onPress={() => onClaim(item)} />
                    </View>
                </>
            ) : (
                <Text style={[styles.note, { color: muted }]}>{NOT_ON_SOLANA}</Text>
            )}
        </View>
    );
}

export function Row({ label, children, muted, line }: {
    label: string;
    children: React.ReactNode;
    muted: string;
    line: string;
}) {
    return (
        <View style={[styles.row, { borderBottomColor: line }]}>
            <Text style={[styles.label, { color: muted }]}>{label}</Text>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    offchain: {
        gap: space.sm,
    },
    recorded: {
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.sub,
        includeFontPadding: false,
    },
    note: {
        fontFamily: "Dank Mono",
        fontSize: typeScale.sub,
        includeFontPadding: false,
    },
    inline: {
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space.md,
        paddingVertical: space.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    label: {
        fontFamily: "Dank Mono",
        fontSize: typeScale.caption + 1,
        includeFontPadding: false,
    },
    value: {
        flexShrink: 1,
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.caption + 1,
        textAlign: "right",
        includeFontPadding: false,
    },
    cta: {
        marginTop: space.md,
    },
});
