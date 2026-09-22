import React, { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Download, Link2 } from 'lucide-react-native';
import EventCta from '@/components/Events/EventCta';
import XLogo from '@/components/Shared/XLogo';
import haptics from '@/src/utils/haptics';
import { track } from '@/src/utils/analytics';
import { saveMeetCard } from '@/src/utils/meetCardShare';
import {
    meetCardUrl,
    meetPageUrl,
    meetShareIntentUrl,
    shareInfoFromMeet,
    type MeetData,
    type MeetShareInfo,
} from '@/src/utils/meetShare';
import { colors, space, type as typeScale } from '@/src/theme/tokens';

type Props = {
    slug: string;
    /** Once loaded: the post names the event, the card URL is versioned. */
    meet: MeetData | null;
    /** What the post says until the meet has loaded (right after a tap). */
    fallback?: MeetShareInfo;
    viewerId?: number | null;
    showCopyLink?: boolean;
    /** Analytics: where the buttons were. */
    place: 'tap' | 'sheet';
};

/** "Share on X" (primary), "Save image" and optionally "Copy link" for one meet. */
export default function MeetShareActions({ slug, meet, fallback, viewerId, showCopyLink = false, place }: Props) {
    const [saving, setSaving] = useState(false);
    const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
    const mounted = useRef(true);
    useEffect(() => () => { mounted.current = false; }, []);

    const info = meet ? shareInfoFromMeet(meet, viewerId) : fallback ?? null;
    const tier = meet?.tier ?? 'unknown';

    const shareOnX = async () => {
        if (!info) return;
        setNote(null);
        try {
            await Linking.openURL(meetShareIntentUrl(info));
            track('meet_share_x_opened', { place, tier });
        } catch {
            haptics.notification('error');
            setNote({ text: "Couldn't open X. Try again.", error: true });
        }
    };

    const saveImage = async () => {
        if (saving) return;
        setSaving(true);
        setNote(null);
        try {
            const result = await saveMeetCard(meet?.story_url ?? meetCardUrl(slug, 'story'), slug);
            if (!mounted.current) return;
            if (result === 'saved') {
                haptics.notification('success');
                setNote({ text: 'Saved to Photos', error: false });
            }
            track('meet_card_saved', { place, tier, how: result });
        } catch {
            if (!mounted.current) return;
            haptics.notification('error');
            setNote({ text: "Couldn't save the card. Try again.", error: true });
        } finally {
            if (mounted.current) setSaving(false);
        }
    };

    const copyLink = async () => {
        await Clipboard.setStringAsync(meetPageUrl(slug));
        haptics.selection();
        setNote({ text: 'Link copied', error: false });
        track('meet_link_copied', { place, tier });
    };

    return (
        <View style={styles.wrap}>
            <EventCta
                label="Share on X"
                icon={<XLogo size={15} color="#FFFFFF" />}
                onPress={shareOnX}
                disabled={!info}
            />
            <View style={styles.row}>
                <View style={styles.flex}>
                    <EventCta
                        label="Save image"
                        variant="secondary"
                        icon={<Download size={16} color={colors.accent} />}
                        onPress={saveImage}
                        busy={saving}
                    />
                </View>
                {showCopyLink && (
                    <View style={styles.flex}>
                        <EventCta
                            label="Copy link"
                            variant="secondary"
                            icon={<Link2 size={16} color={colors.accent} />}
                            onPress={copyLink}
                        />
                    </View>
                )}
            </View>
            {note && (
                <Text
                    style={[styles.note, { color: note.error ? colors.danger : colors.success }]}
                    accessibilityLiveRegion="polite"
                >
                    {note.text}
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        width: '100%',
        gap: space.sm,
    },
    row: {
        flexDirection: 'row',
        gap: space.sm,
    },
    flex: {
        flex: 1,
    },
    note: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.caption,
        textAlign: 'center',
        includeFontPadding: false,
    },
});
