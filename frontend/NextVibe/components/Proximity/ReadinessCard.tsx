import React from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { AlertTriangle, ShieldAlert } from 'lucide-react-native';
import haptics from '@/src/utils/haptics';
import { space, radius, colors, type as typeScale } from '@/src/theme/tokens';
import type { ReadinessIssue } from '@/hooks/useProximityReadiness';

type Props = {
    issues: ReadinessIssue[];
    compact?: boolean;
};

/**
 * "Fix this first" checklist for tap screens. Renders nothing when the phone
 * is ready. Blocking items (red) mean this phone can't tap at all; warnings
 * (amber) mean one channel is missing but tapping still works.
 */
export default function ReadinessCard({ issues, compact = false }: Props) {
    const isDark = useColorScheme() === 'dark';
    if (issues.length === 0) return null;

    const main = isDark ? colors.text : '#111827';
    const muted = isDark ? colors.sub : 'rgba(17,24,39,0.6)';

    return (
        <View style={[styles.wrap, compact && styles.wrapCompact]} accessibilityRole="summary">
            {issues.map((issue) => {
                const blocking = issue.severity === 'blocking';
                const tint = blocking ? colors.danger : colors.warning;
                const Icon = blocking ? ShieldAlert : AlertTriangle;
                return (
                    <View
                        key={issue.id}
                        style={[
                            styles.row,
                            {
                                backgroundColor: blocking
                                    ? (isDark ? 'rgba(248,113,113,0.10)' : 'rgba(239,68,68,0.06)')
                                    : (isDark ? 'rgba(251,191,36,0.09)' : 'rgba(245,158,11,0.07)'),
                                borderColor: blocking ? 'rgba(248,113,113,0.28)' : 'rgba(251,191,36,0.28)',
                            },
                        ]}
                    >
                        <Icon size={18} color={tint} strokeWidth={2} style={styles.icon} />
                        <View style={styles.texts}>
                            <Text style={[styles.title, { color: main }]}>{issue.title}</Text>
                            {!compact && <Text style={[styles.message, { color: muted }]}>{issue.message}</Text>}
                        </View>
                        {issue.actionLabel && issue.onAction && (
                            <Pressable
                                onPress={() => {
                                    haptics.impact('light');
                                    issue.onAction?.();
                                }}
                                hitSlop={8}
                                style={({ pressed }) => [
                                    styles.action,
                                    { borderColor: tint, opacity: pressed ? 0.7 : 1 },
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel={`${issue.actionLabel}: ${issue.title}`}
                            >
                                <Text style={[styles.actionText, { color: tint }]}>{issue.actionLabel}</Text>
                            </Pressable>
                        )}
                    </View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        width: '100%',
        gap: space.sm,
        marginTop: space.md,
    },
    wrapCompact: {
        marginTop: space.sm,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: radius.md,
        paddingVertical: space.md,
        paddingHorizontal: space.md,
        gap: space.md,
    },
    icon: {
        alignSelf: 'flex-start',
        marginTop: 1,
    },
    texts: {
        flex: 1,
        gap: 2,
    },
    title: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.sub,
        lineHeight: typeScale.sub + 4,
        includeFontPadding: false,
    },
    message: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.caption,
        lineHeight: typeScale.caption + 5,
        includeFontPadding: false,
    },
    action: {
        minHeight: 32,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.caption,
        includeFontPadding: false,
    },
});
