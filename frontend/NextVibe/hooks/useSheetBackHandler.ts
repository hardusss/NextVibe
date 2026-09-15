import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Android back button closes the open bottom sheet instead of leaving the
 * screen behind it. @gorhom/bottom-sheet modals don't do this on their own.
 */
export function useSheetBackHandler(isOpen: boolean, onClose: () => void) {
    useEffect(() => {
        if (Platform.OS !== 'android' || !isOpen) return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            onClose();
            return true;
        });
        return () => sub.remove();
    }, [isOpen, onClose]);
}
