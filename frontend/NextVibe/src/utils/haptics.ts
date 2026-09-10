import * as ExpoHaptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Semantic haptics — one vocabulary for the whole app.
 *
 * selection()              tab press, segmented control, toggles, picking in a sheet
 * impact('light')          button press that opens something
 * impact('medium')         swipe-to-confirm crossing its threshold
 * impact('rigid')          tap-to-meet / proximity tap detected
 * notification('success')  collect done, check-in done, tap done, verification
 * notification('error')    any failed action
 * notification('warning')  limits (daily cap, sold out)
 *
 * Never fire on scroll or per list render; at most one per user action.
 * All calls are fire-and-forget and swallow errors (simulators, disabled
 * haptics, missing hardware).
 */

type ImpactWeight = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';

const IMPACT_MAP: Record<ImpactWeight, ExpoHaptics.ImpactFeedbackStyle> = {
    light: ExpoHaptics.ImpactFeedbackStyle.Light,
    medium: ExpoHaptics.ImpactFeedbackStyle.Medium,
    heavy: ExpoHaptics.ImpactFeedbackStyle.Heavy,
    rigid: ExpoHaptics.ImpactFeedbackStyle.Rigid,
    soft: ExpoHaptics.ImpactFeedbackStyle.Soft,
};

const NOTIFICATION_MAP = {
    success: ExpoHaptics.NotificationFeedbackType.Success,
    error: ExpoHaptics.NotificationFeedbackType.Error,
    warning: ExpoHaptics.NotificationFeedbackType.Warning,
} as const;

export function selection(): void {
    ExpoHaptics.selectionAsync().catch(() => {});
}

export function impact(weight: ImpactWeight = 'light'): void {
    // Rigid maps to a harsh effect on some Android vibrators — soften it.
    const resolved = Platform.OS === 'android' && weight === 'rigid' ? 'medium' : weight;
    ExpoHaptics.impactAsync(IMPACT_MAP[resolved]).catch(() => {});
}

export function notification(kind: keyof typeof NOTIFICATION_MAP = 'success'): void {
    ExpoHaptics.notificationAsync(NOTIFICATION_MAP[kind]).catch(() => {});
}

export const haptics = { selection, impact, notification };
export default haptics;
