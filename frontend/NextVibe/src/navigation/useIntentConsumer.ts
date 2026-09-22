/**
 * The only place that turns a pending intent into navigation. Mounted once in
 * app/_layout.tsx.
 *
 * - useRouterMountedSignal: flips appReadyStore.routerMounted once the root
 *   <Stack> is really mounted. useRootNavigationState() alone is not enough:
 *   the root layout renders inside expo-router's internal `__root` navigator,
 *   whose state (and key) exists before our <Stack> does.
 * - useIntentConsumer: when useAppReady() is true and an intent exists,
 *   consume it and navigate exactly once.
 */
import { useEffect, useRef } from 'react';
import { useNavigationContainerRef, usePathname, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { walletLogger, WalletTag } from '@/src/utils/walletLogger';
import { openMeetSheet } from '@/src/stores/meetSheetStore';
import { useAppReady, useAppReadyStore } from './appReadyStore';
import { usePendingIntent } from './pendingIntent';
import { isBootstrapPath, MEET_KIND, MEETS_KIND, pickNavigationMethod, PROFILE_PATH, type PendingIntent } from './intents';

const TAG = WalletTag.NAV_INTENT;
/** Never wait longer than this for the Stack to register its state. */
const ROUTER_MOUNT_MAX_WAIT_MS = 2000;

function hasMountedStack(rootState: any): boolean {
    // rootState is the `__root` navigator; its first route renders app/_layout.tsx.
    const inner = rootState?.routes?.[0]?.state;
    return !!inner && Array.isArray(inner.routes) && inner.routes.length > 0;
}

/** `shellRendered`: the root layout has rendered its <Stack> (fonts + settings are in). */
export function useRouterMountedSignal(shellRendered: boolean): void {
    const rootNavigationState = useRootNavigationState();
    const navigationRef = useNavigationContainerRef();
    const rootKey = rootNavigationState?.key;

    useEffect(() => {
        if (!shellRendered) return;
        if (useAppReadyStore.getState().routerMounted) return;
        let cancelled = false;
        let frame = 0;
        const started = Date.now();
        const check = () => {
            if (cancelled) return;
            let mounted = false;
            try {
                mounted = !!rootKey && navigationRef.isReady() && hasMountedStack(navigationRef.getRootState());
            } catch {
                mounted = false;
            }
            const timedOut = Date.now() - started > ROUTER_MOUNT_MAX_WAIT_MS;
            if (mounted || timedOut) {
                if (timedOut && !mounted) walletLogger.warn(TAG, 'Router mount signal timed out; continuing');
                useAppReadyStore.getState().setRouterMounted(true);
                return;
            }
            frame = requestAnimationFrame(check);
        };
        check();
        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
        };
    }, [shellRendered, rootKey, navigationRef]);
}

export function useIntentConsumer(options: { beforeNavigate?: (intent: PendingIntent) => void; afterNavigate?: (intent: PendingIntent) => void } = {}): void {
    const router = useRouter();
    const pathname = usePathname();
    const segments = useSegments();
    const intent = usePendingIntent((s) => s.intent);
    const hydrated = usePendingIntent((s) => s.hydrated);
    const ready = useAppReady(hydrated);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    useEffect(() => {
        if (!ready || !intent) return;
        const taken = usePendingIntent.getState().consume();
        if (!taken) return;

        if (taken.kind === MEET_KIND && taken.params?.slug) {
            // A meet link opens the meet sheet over whatever is on screen;
            // from the start flow, over home.
            try {
                optionsRef.current.beforeNavigate?.(taken);
                walletLogger.info(TAG, 'Consuming intent: meet sheet', { id: taken.id, from: pathname, source: taken.source });
                if (isBootstrapPath(pathname)) router.replace('/home');
                openMeetSheet(taken.params.slug, taken.source);
                optionsRef.current.afterNavigate?.(taken);
            } catch (e) {
                walletLogger.error(TAG, 'Opening the meet sheet failed', e, { id: taken.id });
            }
            return;
        }

        const firstSegment = segments[0] as string | undefined;
        const method = pickNavigationMethod(pathname, firstSegment, taken);
        // The profile uses `intent` to open its sheet once per tap, even if it remounts.
        const params = taken.path === PROFILE_PATH && (taken.kind === 'seeker_verified' || taken.kind === MEETS_KIND)
            ? { ...(taken.params ?? {}), intent: taken.id }
            : taken.params;
        const href: any = params && Object.keys(params).length ? { pathname: taken.path, params } : taken.path;

        try {
            optionsRef.current.beforeNavigate?.(taken);
            walletLogger.info(TAG, 'Consuming intent', {
                id: taken.id, path: taken.path, params, method, from: pathname, source: taken.source, kind: taken.kind,
                ageMs: Date.now() - taken.createdAt,
            });
            if (method === 'replace') router.replace(href);
            else if (method === 'homeThenPush') {
                router.replace('/home');
                router.push(href);
            }
            else if (method === 'navigate') router.navigate(href);
            else if (method === 'dismissTo') router.dismissTo(href);
            else router.push(href);
            optionsRef.current.afterNavigate?.(taken);
        } catch (e) {
            walletLogger.error(TAG, 'Navigation for intent failed', e, { id: taken.id, path: taken.path, method });
            if (isBootstrapPath(pathname)) {
                try { router.replace('/home'); } catch { /* nothing left to try */ }
            }
        }
    }, [ready, intent, pathname, segments, router]);
}
