import React, { useEffect, useState } from 'react';
import {
    KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, useColorScheme,
} from 'react-native';
import EventCta from '@/components/Events/EventCta';
import { setMeetPhotoCaption } from '@/src/api/meetPhoto';
import haptics from '@/src/utils/haptics';
import { colors, radius, space, type as typeScale } from '@/src/theme/tokens';

const MAX = 255;

type Props = {
    visible: boolean;
    slug: string;
    initial: string;
    onClose: () => void;
    onSaved: (about: string) => void;
};

/** The caption of a Proof of Meet post: either of the two can edit it, the last edit wins. */
export default function CaptionEditor({ visible, slug, initial, onClose, onSaved }: Props) {
    const isDark = useColorScheme() === 'dark';
    const [text, setText] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (visible) {
            setText(initial);
            setError(null);
        }
    }, [visible, initial]);

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const result = await setMeetPhotoCaption(slug, text);
            haptics.notification('success');
            onSaved(result.about);
            onClose();
        } catch (e: any) {
            haptics.notification('error');
            setError(e?.message ?? "Couldn't save the caption. Try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
                <View style={[styles.card, { backgroundColor: isDark ? '#110a1e' : '#FFFFFF' }]}>
                    <Text style={[styles.title, { color: isDark ? colors.text : '#111827' }]}>Caption</Text>
                    <Text style={[styles.hint, { color: isDark ? colors.sub : 'rgba(17,24,39,0.55)' }]}>
                        You both see it; whoever edits last sets it.
                    </Text>
                    <TextInput
                        value={text}
                        onChangeText={(value) => setText(value.slice(0, MAX))}
                        placeholder="Say something about this meet"
                        placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(17,24,39,0.35)'}
                        multiline
                        autoFocus
                        maxLength={MAX}
                        style={[styles.input, {
                            color: isDark ? colors.text : '#111827',
                            borderColor: isDark ? 'rgba(168,85,247,0.3)' : 'rgba(124,58,237,0.25)',
                        }]}
                    />
                    <Text style={[styles.count, { color: isDark ? colors.sub : 'rgba(17,24,39,0.45)' }]}>{text.length}/{MAX}</Text>
                    {error && <Text style={styles.error}>{error}</Text>}
                    <View style={styles.row}>
                        <View style={styles.flex}><EventCta label="Cancel" variant="secondary" onPress={onClose} disabled={saving} /></View>
                        <View style={styles.flex}><EventCta label="Save" onPress={save} busy={saving} /></View>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'center',
        padding: space.xl,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    card: {
        borderRadius: radius.lg,
        padding: space.lg,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.22)',
    },
    title: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.body,
        includeFontPadding: false,
    },
    hint: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.caption,
        marginTop: space.xs,
        includeFontPadding: false,
    },
    input: {
        minHeight: 96,
        maxHeight: 180,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: space.md,
        marginTop: space.md,
        fontFamily: 'Dank Mono',
        fontSize: typeScale.sub,
        textAlignVertical: 'top',
    },
    count: {
        alignSelf: 'flex-end',
        fontFamily: 'Dank Mono',
        fontSize: typeScale.caption,
        marginTop: space.xs,
        includeFontPadding: false,
    },
    error: {
        color: colors.danger,
        fontFamily: 'Dank Mono',
        fontSize: typeScale.caption,
        marginTop: space.xs,
        includeFontPadding: false,
    },
    row: {
        flexDirection: 'row',
        gap: space.md,
        marginTop: space.md,
    },
    flex: {
        flex: 1,
    },
});
