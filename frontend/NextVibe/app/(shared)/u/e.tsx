import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CustomActivityIndicator from '@/components/CustomActivityIndicator';
import { enqueueProximityLink } from '@/src/proximity/linkQueue';
import { safeBack } from '@/src/utils/safeBack';
import { colors } from '@/src/theme/tokens';

/**
 * Fallback route for tap links that were navigated to in-app (system links
 * are intercepted in app/+native-intent.ts). Hands the token to the shared
 * tap prompt and steps out of the way.
 */
export default function ProximityTokenScreen() {
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const params = useLocalSearchParams<{ t?: string }>();
    const handledRef = useRef(false);

    useEffect(() => {
        if (handledRef.current) return;
        handledRef.current = true;
        if (params.t) {
            enqueueProximityLink(`/u/e?t=${encodeURIComponent(params.t)}`);
        }
        safeBack(router);
    }, [params.t, router]);

    return (
        <View style={[styles.container, { backgroundColor: isDark ? colors.bg : '#FFFFFF' }]}>
            <CustomActivityIndicator size="large" />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
