import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Sparkles, ArrowDownLeft, ArrowUpRight, Flame, Image as ImageIcon } from 'lucide-react-native';

import { FormattedTransaction, NftDetails } from '@/src/types/solana';
import { useCnftDisplayData } from '@/src/utils/solana/cnftMetadata';
import timeAgo from '@/src/utils/formatTime';

/** Row titles per cNFT event kind */
export const CNFT_TITLES: Record<NftDetails['kind'], string> = {
    claimed: 'Collected',
    received: 'Received',
    sent: 'Sent',
    burned: 'Burned',
};

/** Logo used when a cNFT row falls back to a generic token icon */
export const CNFT_LOGO_URL =
    'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';

/**
 * Builds the `/transaction-detail` navigation payload for a cNFT
 * transaction — one source of truth for the history row and the
 * dashboard's Last Transaction card so their params can't drift.
 */
export function buildCnftDetailParams(
    item: FormattedTransaction,
    name: string | null,
    image: string | null,
) {
    return {
        pathname: '/transaction-detail' as const,
        params: {
            tx_id: item.signature,
            amount: item.amount,
            direction: item.type,
            icon: CNFT_LOGO_URL,
            timestamp: item.time?.getTime() || Date.now(),
            to_address: item.to,
            from_address: item.from,
            blockchain: item.token,
            usdValue: '0.00',
            tx_url: `https://solscan.io/tx/${item.signature}?cluster=mainnet`,
            nft_asset_id: item.nft?.assetId ?? '',
            nft_name: name ?? '',
            nft_kind: item.nft?.kind ?? '',
            nft_memo: item.nft?.memo ?? '',
            nft_image: image ?? '',
            nft_fee: item.fee ?? 0,
        },
    };
}

const KIND_META: Record<NftDetails['kind'], { Icon: typeof Sparkles; color: string }> = {
    claimed: { Icon: Sparkles, color: '#a855f7' },
    received: { Icon: ArrowDownLeft, color: '#2ECC71' },
    sent: { Icon: ArrowUpRight, color: '#E74C3C' },
    burned: { Icon: Flame, color: '#f97316' },
};

interface NftTxRowProps {
    nft: NftDetails;
    isDark: boolean;
    /** Shown right-aligned when provided (dashboard card); omit in history rows */
    time?: Date | null;
}

/**
 * Presentational body of a cNFT transaction row — thumbnail with a kind
 * badge, "Collected / Received / Sent / Burned" title, asset name, no
 * amount and no USD value. Shared by TransactionsHistory's TransactionItem
 * and the dashboard's LastTransaction card.
 */
export default function NftTxRow({ nft, isDark, time }: NftTxRowProps) {
    const display = useCnftDisplayData(nft.assetId, nft.uri);
    const name = nft.name ?? display.name;
    const image = display.image;

    const { Icon, color } = KIND_META[nft.kind];
    const titleColor = isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.82)';
    const subColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
    const mutedText = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.38)';
    const badgeBorder = isDark ? 'rgba(30,30,30,0.9)' : '#ffffff';

    return (
        <>
            <View style={s.thumbWrap}>
                {image ? (
                    <Image source={{ uri: image }} style={s.thumbnail} contentFit="cover" />
                ) : (
                    <View style={[s.thumbnail, s.thumbPlaceholder]}>
                        <ImageIcon size={18} color={isDark ? '#888' : '#999'} />
                    </View>
                )}
                <View style={[s.kindBadge, { backgroundColor: color, borderColor: badgeBorder }]}>
                    <Icon size={10} color="#fff" strokeWidth={2} />
                </View>
            </View>

            <View style={s.textBlock}>
                <Text style={[s.title, { color: titleColor }]} numberOfLines={1}>
                    {CNFT_TITLES[nft.kind]}
                </Text>
                <Text style={[s.sub, { color: subColor }]} numberOfLines={1}>
                    {name ?? 'cNFT'}
                </Text>
            </View>

            {time !== undefined && (
                <Text style={[s.time, { color: mutedText }]}>
                    {time ? timeAgo(new Date(time).toISOString()) : ''}
                </Text>
            )}
        </>
    );
}

const s = StyleSheet.create({
    thumbWrap: {
        width: 44,
        height: 44,
        marginRight: 14,
    },
    thumbnail: {
        width: 44,
        height: 44,
        borderRadius: 8,
        backgroundColor: 'rgba(128,128,128,0.15)',
    },
    thumbPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    kindBadge: {
        position: 'absolute',
        bottom: -1,
        right: -1,
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        zIndex: 3,
    },
    textBlock: {
        flex: 1,
    },
    title: {
        fontFamily: 'Dank Mono',
        fontSize: 14,
        includeFontPadding: false,
        marginBottom: 5,
    },
    sub: {
        fontFamily: 'Dank Mono',
        fontSize: 12,
        includeFontPadding: false,
    },
    time: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        marginLeft: 8,
    },
});
