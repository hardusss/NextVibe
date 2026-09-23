import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera } from 'lucide-react-native';
import EventCta from '@/components/Events/EventCta';
import { useMeetPhoto } from '@/components/Meet/useMeetPhoto';
import { startMeetSelfie } from '@/components/Meet/startMeetSelfie';
import { FEATURE_PROOF_OF_MEET } from '@/constants/FeatureFlags';
import { bumpMeetPhoto, isMeetPhotoSkipped, openMeetPhotoSheet, skipMeetPhoto } from '@/src/stores/meetPhotoStore';
import haptics from '@/src/utils/haptics';
import { track } from '@/src/utils/analytics';
import { colors, space, type as typeScale } from '@/src/theme/tokens';

type Props = {
    slug: string | null;
    /** Who they just met, for the camera screen's title. */
    otherUsername?: string | null;
    /** Runs once the meet is locked, right before the camera opens (the tap sheet closes itself). */
    onOpenCamera?: () => void;
};

/**
 * "Take a selfie together" / "Skip" under "You met @x". Either of the two can
 * start it; the other phone then shows who is taking the photo. Skip is one
 * tap and never asks again for this meet. Shows only when the server takes
 * photos (its private storage is set up) and the meet has no photo yet.
 */
export default function MeetSelfieCta({ slug, otherUsername, onOpenCamera }: Props) {
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const [skipped, setSkipped] = useState<boolean | null>(null);
    const [starting, setStarting] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const enabled = FEATURE_PROOF_OF_MEET && !!slug;

    useEffect(() => {
        if (!enabled || !slug) return;
        let alive = true;
        isMeetPhotoSkipped(slug).then((value) => alive && setSkipped(value));
        return () => {
            alive = false;
        };
    }, [enabled, slug]);

    const { data } = useMeetPhoto(slug, enabled && skipped === false);
    if (!enabled || !slug || skipped !== false || !data || !data.available) return null;

    const muted = isDark ? colors.sub : 'rgba(17,24,39,0.6)';
    const info = (text: string) => (
        <View style={styles.info}>
            <Camera size={15} color={colors.accent} />
            <Text style={[styles.infoText, { color: muted }]} accessibilityLiveRegion="polite">{text}</Text>
        </View>
    );

    if (data.taking && !data.taking.mine) return info(`@${data.taking.username} is taking the photo…`);

    const role = data.photo?.role;
    if (data.status === 'pending' && role === 'subject') {
        return (
            <EventCta
                label="Review the photo"
                icon={<Camera size={16} color="#fff" />}
                onPress={() => openMeetPhotoSheet(slug, 'tap')}
            />
        );
    }
    if (data.status === 'pending') return info(`Sent — waiting for @${data.other.username}`);
    if (data.status === 'approved' || data.status === 'minted') {
        return (
            <EventCta
                label="Your Proof of Meet photo"
                variant="secondary"
                icon={<Camera size={16} color={colors.accent} />}
                onPress={() => openMeetPhotoSheet(slug, 'tap')}
            />
        );
    }
    if (!data.can_start) return null;

    const start = async () => {
        if (starting) return;
        setStarting(true);
        setNote(null);
        const result = await startMeetSelfie(router, slug, otherUsername ?? data.other.username, onOpenCamera);
        setStarting(false);
        if (!result.ok) {
            haptics.notification('error');
            if (result.error.code === 'LOCKED') bumpMeetPhoto(slug); // shows who took it
            else setNote(result.error.message);
        }
    };

    const skip = () => {
        haptics.selection();
        skipMeetPhoto(slug);
        setSkipped(true);
        track('meet_selfie_skipped');
    };

    return (
        <View style={styles.wrap}>
            <EventCta
                label="Take a selfie together"
                icon={<Camera size={16} color="#fff" />}
                onPress={start}
                busy={starting}
            />
            <Pressable
                onPress={skip}
                disabled={starting}
                hitSlop={{ top: 10, bottom: 10, left: 24, right: 24 }}
                style={styles.skip}
                accessibilityRole="button"
                accessibilityLabel="Skip the selfie"
            >
                <Text style={[styles.skipText, { color: muted }]}>Skip</Text>
            </Pressable>
            {note && <Text style={styles.note}>{note}</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        width: '100%',
        gap: space.xs,
    },
    skip: {
        alignSelf: 'center',
        paddingHorizontal: space.md,
        paddingVertical: space.xs,
    },
    skipText: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.sub,
        includeFontPadding: false,
    },
    info: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        paddingVertical: space.sm,
    },
    infoText: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.sub,
        includeFontPadding: false,
    },
    note: {
        color: colors.danger,
        fontFamily: 'Dank Mono',
        fontSize: typeScale.caption,
        textAlign: 'center',
        includeFontPadding: false,
    },
});
