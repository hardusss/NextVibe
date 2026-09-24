import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from "react-native";
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { FullWindowOverlay } from "react-native-screens";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CheckCircle2, KeyRound, Wallet } from "lucide-react-native";

import EventCta from "@/components/Events/EventCta";
import { useMwaAdapter } from "@/hooks/useMwaAdapter";
import { useSheetBackHandler } from "@/hooks/useSheetBackHandler";
import saveWallet from "@/src/api/save.wallet";
import { useCollectibles } from "@/src/stores/collectiblesStore";
import { closeConnectWallet, useConnectWallet, type ConnectWalletReason } from "@/src/stores/connectWalletStore";
import { COLLECTIBLES_OPEN_PARAM, PROFILE_PATH } from "@/src/navigation/intents";
import { landingText } from "@/src/utils/collectibles";
import { extractErrorMessage, walletLogger, WalletTag } from "@/src/utils/walletLogger";
import haptics from "@/src/utils/haptics";
import { colors, radius, space, type as typeScale } from "@/src/theme/tokens";

/** iOS: above native-stack modals too (the check-in screen is one). */
const IosOverlayContainer = ({ children }: React.PropsWithChildren) => (
    <FullWindowOverlay>
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>{children}</GestureHandlerRootView>
    </FullWindowOverlay>
);
const containerComponent = Platform.OS === "ios" ? IosOverlayContainer : undefined;

type Phase = "choose" | "connecting" | "saving" | "landing" | "connected" | "error";
type DeepLinkWallet = "phantom" | "solflare" | "backpack";

const IOS_WALLETS: { id: DeepLinkWallet; label: string }[] = [
    { id: "phantom", label: "Phantom" },
    { id: "solflare", label: "Solflare" },
    { id: "backpack", label: "Backpack" },
];

function intro(reason: ConnectWalletReason | null, claimable: number): string {
    if (reason === "collect") return "Collecting a post needs a wallet. Connect one and the collect goes on right away.";
    if (claimable > 0) {
        const what = claimable === 1 ? "your collectible" : `your ${claimable} collectibles`;
        return `Connect a wallet and ${what} go${claimable === 1 ? "es" : ""} on Solana. It's free and takes about 10 seconds.`;
    }
    return "Everything you collect on NextVibe goes on Solana, in your own wallet. It's free and takes about 10 seconds.";
}

/**
 * Connect a wallet, from anywhere: Claim without one, the "saved off-chain"
 * banner, the check-in and tap notes, Collect, nextvibe.io/u/wallet. MWA on
 * Android and Seeker (the Seed Vault works), Phantom, Solflare or Backpack
 * on iPhone, or a new passkey wallet. Once the server has the wallet,
 * everything saved off-chain goes on Solana: "Putting 7 collectibles on
 * Solana…", counting up as they land. Mounted once in the root layout;
 * state in src/stores/connectWalletStore.
 */
export default function ConnectWalletSheet() {
    const reason = useConnectWallet((s) => s.reason);
    const openCount = useConnectWallet((s) => s.openCount);
    const sheetRef = useRef<BottomSheetModal>(null);
    const isDark = useColorScheme() === "dark";
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const router = useRouter();
    const { account, connect, disconnect } = useMwaAdapter();
    const summary = useCollectibles((s) => s.summary);
    const landing = useCollectibles((s) => s.landing);
    const [phase, setPhase] = useState<Phase>("choose");
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const busy = phase === "connecting" || phase === "saving";
    const mounted = useRef(true);

    useEffect(() => () => { mounted.current = false; }, []);

    useEffect(() => {
        if (!reason) return;
        setPhase("choose");
        setError(null);
        useCollectibles.getState().refreshSummary();
        sheetRef.current?.present();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openCount]);

    const close = useCallback(() => sheetRef.current?.dismiss(), []);
    useSheetBackHandler(open, close);

    const finish = useCallback(async (address: string) => {
        setPhase("saving");
        try {
            const data = await saveWallet(address);
            if (!mounted.current) return;
            haptics.notification("success");
            const queued = Number(data?.collectibles?.queued) || 0;
            const onConnected = useConnectWallet.getState().onConnected;
            if (onConnected) {
                // A Collect waiting for the wallet goes on right away
                close();
                onConnected(address);
                return;
            }
            setPhase(queued > 0 ? "landing" : "connected");
        } catch (e) {
            const message = extractErrorMessage(e);
            walletLogger.error(WalletTag.API, `ConnectWalletSheet: saving ${address} failed: ${message}`, e);
            try { await disconnect(); } catch { /* the save failing is what matters */ }
            if (!mounted.current) return;
            haptics.notification("error");
            setError(message);
            setPhase("error");
        }
    }, [close, disconnect]);

    const connectWith = useCallback(async (wallet?: DeepLinkWallet) => {
        if (busy) return;
        setError(null);
        setPhase("connecting");
        try {
            if (Platform.OS === "android" && account) await disconnect();
            const connected = await connect(wallet);
            if (!mounted.current) return;
            if (!connected) {
                setPhase("choose");
                return;
            }
            const address = Platform.OS === "ios" ? connected.publicKey.toBase58() : connected.address.toString();
            await finish(address);
        } catch (e) {
            if (!mounted.current) return;
            const message = extractErrorMessage(e);
            walletLogger.warn(WalletTag.MWA, `ConnectWalletSheet: connect failed: ${message}`);
            setError(message);
            setPhase("error");
        }
    }, [account, busy, connect, disconnect, finish]);

    const passkey = useCallback(() => {
        close();
        router.push("/wallet-init?page=wallet-dash" as any);
    }, [close, router]);

    const seeThem = useCallback(() => {
        close();
        router.navigate({ pathname: PROFILE_PATH, params: { open: COLLECTIBLES_OPEN_PARAM } } as any);
    }, [close, router]);

    const renderBackdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.6}
                pressBehavior={busy ? "none" : "close"} />
        ),
        [busy],
    );

    const main = isDark ? colors.text : "#111827";
    const muted = isDark ? colors.sub : "rgba(17,24,39,0.6)";
    const claimable = summary?.claimable ?? 0;

    const renderBody = () => {
        if (phase === "landing" && landing) {
            const progress = landing.total ? Math.min(1, landing.landed / landing.total) : 0;
            return (
                <View style={styles.center}>
                    {landing.done && landing.waiting === 0
                        ? <CheckCircle2 size={40} color={colors.success} />
                        : <ActivityIndicator size="large" color={colors.accent} />}
                    <Text style={[styles.title, { color: main }]}>{landingText(landing.total, landing.landed)}</Text>
                    <Text style={[styles.text, { color: muted }]}>
                        {landing.done && landing.waiting > 0
                            ? `${landing.landed} landed, ${landing.waiting} will retry automatically.`
                            : `${landing.landed} of ${landing.total} on Solana`}
                    </Text>
                    <View style={[styles.track, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(17,24,39,0.08)" }]}>
                        <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
                    </View>
                    <View style={styles.actions}>
                        <EventCta label="See them" onPress={seeThem} />
                        <EventCta label={landing.done ? "Done" : "Keep going"} variant="ghost" onPress={close} />
                    </View>
                </View>
            );
        }
        if (phase === "connected" || (phase === "landing" && !landing)) {
            return (
                <View style={styles.center}>
                    <CheckCircle2 size={40} color={colors.success} />
                    <Text style={[styles.title, { color: main }]}>Wallet connected</Text>
                    <Text style={[styles.text, { color: muted }]}>What you collect from now on goes straight to it.</Text>
                    <View style={styles.actions}><EventCta label="Done" onPress={close} /></View>
                </View>
            );
        }
        if (busy) {
            return (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={[styles.title, { color: main }]}>
                        {phase === "saving" ? "Linking it to your profile…" : "Waiting for your wallet…"}
                    </Text>
                </View>
            );
        }
        return (
            <>
                <View style={styles.header}>
                    <Wallet size={22} color={colors.accent} />
                    <Text style={[styles.title, styles.left, { color: main }]}>Connect a wallet</Text>
                </View>
                <Text style={[styles.text, styles.left, { color: muted }]}>{intro(reason, claimable)}</Text>
                {phase === "error" && !!error && (
                    <Text style={[styles.error, { color: isDark ? "#fca5a5" : "#b91c1c" }]}>{error}</Text>
                )}
                <View style={styles.actions}>
                    {Platform.OS === "ios"
                        ? IOS_WALLETS.map((w, index) => (
                            <EventCta key={w.id} label={w.label} variant={index === 0 ? "primary" : "secondary"}
                                onPress={() => connectWith(w.id)} />
                        ))
                        : <EventCta label="Connect wallet" onPress={() => connectWith()} />}
                    <EventCta label="Create a passkey wallet" variant="secondary"
                        icon={<KeyRound size={16} color={isDark ? colors.text : "#111827"} />} onPress={passkey} />
                    <EventCta label="Not now" variant="ghost" onPress={close} />
                </View>
                {Platform.OS === "android" && (
                    <Text style={[styles.hint, { color: muted }]}>On a Seeker, your Seed Vault wallet works.</Text>
                )}
            </>
        );
    };

    return (
        <BottomSheetModal
            ref={sheetRef}
            containerComponent={containerComponent}
            stackBehavior="push"
            enableDynamicSizing
            enablePanDownToClose={!busy}
            maxDynamicContentSize={height - insets.top - space.xl}
            backdropComponent={renderBackdrop}
            backgroundStyle={{ backgroundColor: isDark ? "#0A0410" : "#F5F3FF" }}
            handleIndicatorStyle={{ backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)" }}
            onChange={(index) => setOpen(index >= 0)}
            onDismiss={() => {
                setOpen(false);
                closeConnectWallet();
                const store = useCollectibles.getState();
                if (store.landing?.done) store.clearLanding();
            }}
        >
            <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
                {renderBody()}
            </BottomSheetView>
        </BottomSheetModal>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: space.lg,
        paddingTop: space.sm,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        marginBottom: space.sm,
    },
    center: {
        alignItems: "center",
        gap: space.sm,
        paddingVertical: space.md,
    },
    title: {
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.h2,
        textAlign: "center",
        includeFontPadding: false,
    },
    left: {
        textAlign: "left",
    },
    text: {
        fontFamily: "Dank Mono",
        fontSize: typeScale.sub,
        lineHeight: 21,
        textAlign: "center",
        includeFontPadding: false,
    },
    error: {
        marginTop: space.sm,
        fontFamily: "Dank Mono",
        fontSize: typeScale.sub,
        includeFontPadding: false,
    },
    hint: {
        marginTop: space.md,
        fontFamily: "Dank Mono",
        fontSize: typeScale.caption,
        textAlign: "center",
        includeFontPadding: false,
    },
    actions: {
        marginTop: space.lg,
        gap: space.sm,
        alignSelf: "stretch",
    },
    track: {
        marginTop: space.sm,
        alignSelf: "stretch",
        height: 6,
        borderRadius: radius.pill,
        overflow: "hidden",
    },
    fill: {
        height: "100%",
        borderRadius: radius.pill,
        backgroundColor: colors.accent,
    },
});
