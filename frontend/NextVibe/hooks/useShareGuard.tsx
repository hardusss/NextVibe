import React, { useCallback, useEffect, useRef, useState } from "react";
import { Share, ShareContent, StyleSheet, View } from "react-native";

/**
 * Guards a screen while the native share sheet is up.
 *
 * On iOS the tap that dismisses the share sheet also lands on the views
 * underneath it, so a user closing the sheet would accidentally open the
 * photo viewer, post details, etc. While a share is in flight (plus a short
 * grace period around dismissal) the screen should render <ShareTouchBlocker>
 * to swallow those touches.
 */
export default function useShareGuard() {
    const [isSharing, setIsSharing] = useState(false);
    const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => { if (clearTimer.current) clearTimeout(clearTimer.current); };
    }, []);

    const share = useCallback(async (content: ShareContent) => {
        setIsSharing(true);
        try {
            await Share.share(content);
        } catch (error) {
            console.error("Error sharing:", error);
        } finally {
            // The dismissing tap can land right as the share promise resolves,
            // so keep swallowing touches for a beat after dismissal.
            if (clearTimer.current) clearTimeout(clearTimer.current);
            clearTimer.current = setTimeout(() => setIsSharing(false), 400);
        }
    }, []);

    return { isSharing, share };
}

/** Transparent full-screen overlay that absorbs all touches while active. */
export const ShareTouchBlocker = ({ active }: { active: boolean }) => {
    if (!active) return null;
    return (
        <View
            style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]}
            onStartShouldSetResponder={() => true}
        />
    );
};
