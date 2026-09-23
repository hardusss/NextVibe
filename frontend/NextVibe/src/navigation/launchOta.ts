/**
 * The OTA update check that expo-updates runs on its own at every cold start
 * (checkOnLaunch ALWAYS, launch wait 0). It checks the server and, when there
 * is a new update, downloads it in the background.
 *
 * expo-updates runs one job at a time, so a checkForUpdateAsync() or
 * fetchUpdateAsync() call from JS waits until that launch download has
 * finished. Splash therefore reads the native launch state instead of asking
 * the server again: a capped checkForUpdateAsync() times out whenever there
 * is an update to download, and the update screen never shows.
 */
import * as Updates from 'expo-updates';

export type LaunchOta = 'checking' | 'update' | 'none';

/** The fields of the expo-updates native state this reads. */
export interface LaunchOtaState {
    isStartupProcedureRunning: boolean;
    isChecking: boolean;
    isUpdateAvailable: boolean;
    isUpdatePending: boolean;
    checkError?: Error;
    lastCheckForUpdateTime?: Date;
}

/** Pure so it can be unit-tested. */
export function launchOtaVerdict(s: LaunchOtaState): LaunchOta {
    // Found at launch: downloading now, or already on disk.
    if (s.isUpdateAvailable || s.isUpdatePending) return 'update';
    // The launch check is over (it found nothing or failed), or it never ran.
    if (!s.isStartupProcedureRunning || s.checkError) return 'none';
    // Checked, nothing new; the procedure itself ends a moment later.
    if (!s.isChecking && s.lastCheckForUpdateTime) return 'none';
    return 'checking';
}

/**
 * Resolves with the launch verdict as soon as it is known, or with
 * 'checking' after `timeoutMs`. Listens to the same native events that
 * useUpdates() reads, without re-rendering anything.
 */
export function whenLaunchOtaKnown(timeoutMs: number): Promise<LaunchOta> {
    if (!Updates.isEnabled) return Promise.resolve('none');
    const now = launchOtaVerdict(Updates.latestContext);
    if (now !== 'checking') return Promise.resolve(now);

    return new Promise((resolve) => {
        const subscription = Updates.addUpdatesStateChangeListener(({ context }) => {
            const verdict = launchOtaVerdict(context);
            if (verdict !== 'checking') finish(verdict);
        });
        const timer = setTimeout(() => finish('checking'), timeoutMs);

        function finish(verdict: LaunchOta) {
            subscription.remove();
            clearTimeout(timer);
            resolve(verdict);
        }
    });
}

/**
 * Calls `listener` with the native download progress (0..1) now and on every
 * change, until the returned function is called. Covers both the launch
 * download and fetchUpdateAsync(). A fetch after the launch download starts
 * again from 0, so callers should keep the highest value.
 */
export function subscribeOtaDownloadProgress(listener: (progress: number) => void): () => void {
    const emit = (s: { isDownloading: boolean; isUpdatePending: boolean; downloadProgress: number }) => {
        if (s.isDownloading) listener(s.downloadProgress);
        else if (s.isUpdatePending) listener(1);
    };
    emit(Updates.latestContext);
    const subscription = Updates.addUpdatesStateChangeListener(({ context }) => emit(context));
    return () => subscription.remove();
}
