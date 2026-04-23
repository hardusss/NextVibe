import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useColorScheme,
    Keyboard,
    Pressable,
    Image,
    Dimensions,
} from "react-native";
import {
    BottomSheetBackdrop,
    BottomSheetBackdropProps,
    BottomSheetModal,
    BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BlurView } from "@react-native-community/blur";
import { Calendar, MapPin, Link2 } from "lucide-react-native";
import { storage } from "@/src/utils/storage";
import { previewLumaEvent, verifyLumaEvent, LumaEventPreview } from "@/src/api/luma.event";
import createPost from "@/src/api/create.post";
import type { LumaEvent } from "@/src/api/create.post";
import mintNFT from "@/src/api/mint.nft";
import * as Haptics from "expo-haptics";


function extractApiError(e: unknown, fallback: string): string {
    if (e && typeof e === "object") {
        const ax = e as { response?: { data?: { error?: string; detail?: string } }; message?: string };
        const data = ax.response?.data;
        if (data?.error) return `Server: ${data.error}`;
        if (data?.detail) return `Server: ${data.detail}`;
        if (ax.message) return ax.message;
    }
    return fallback;
}

export interface AddLumaEventSheetRef {
    present: () => void;
    dismiss: () => void;
}

type Props = {
    onSaved?: (link: string) => void;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_CONTENT_WIDTH = SCREEN_WIDTH - 44;
const CARD_PADDING = 14;

function isProbablyLumaEventUrl(url: string) {
    const u = url.trim().toLowerCase();
    return u.startsWith("https://lu.ma/") || u.startsWith("https://luma.com/");
}

function formatEventDate(iso: string | null | undefined): string | null {
    if (!iso) return null;
    try {
        return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
            timeZoneName: "short",
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

const LUMA_HIDDEN_LOCATION = "register to see address";

function formatLocation(location: LumaEventPreview["location"]): string | null {
    const parts = [location?.name, location?.address]
        .filter(Boolean)
        .filter((v) => v!.toLowerCase() !== LUMA_HIDDEN_LOCATION)
        .filter((v, i, arr) => arr.indexOf(v) === i); // dedupe
    return parts.length ? parts.join(" · ") : null;
}

const AddLumaEventSheet = forwardRef<AddLumaEventSheetRef, Props>(({ onSaved }, ref) => {
    const isDark = useColorScheme() === "dark";
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const [link, setLink] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [preview, setPreview] = useState<LumaEventPreview | null>(null);
    const [code, setCode] = useState<string | null>(null);
    const [verified, setVerified] = useState<boolean | null>(null);
    const [descExpanded, setDescExpanded] = useState(false);
    const [imageHeight, setImageHeight] = useState<number | null>(null);
    const [editedDescription, setEditedDescription] = useState("");
    const [lat, setLat] = useState<number | null>(null);
    const [lng, setLng] = useState<number | null>(null);
    const [createEventState, setCreateEventState] = useState<"idle" | "posting" | "minting" | "success" | "error">("idle");

    const snapPoints = useMemo(() => ["85%"], []);

    const backdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop
                {...props}
                appearsOnIndex={0}
                disappearsOnIndex={-1}
                pressBehavior="close"
            >
                <BlurView style={StyleSheet.absoluteFill} blurType={isDark ? "dark" : "light"} blurAmount={2} />
                <View
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: isDark ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.2)" },
                    ]}
                />
            </BottomSheetBackdrop>
        ),
        [isDark]
    );

    const resetState = () => {
        setLink("");
        setError(null);
        setIsLoading(false);
        setPreview(null);
        setCode(null);
        setVerified(null);
        setDescExpanded(false);
        setImageHeight(null);
        setEditedDescription("");
        setCreateEventState("idle");
    };

    useImperativeHandle(ref, () => ({
        present: () => {
            resetState();
            bottomSheetModalRef.current?.present();
        },
        dismiss: () => bottomSheetModalRef.current?.dismiss(),
    }));

    const bg = isDark ? "#0f021c" : "#ffffff";
    const main = isDark ? "#ffffff" : "#111827";
    const muted = isDark ? "rgba(255,255,255,0.55)" : "rgba(17,24,39,0.55)";
    const border = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
    const inputBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
    const accent = "#A855F7";

    const resolveImageHeight = (url: string) => {
        setImageHeight(null);
        Image.getSize(
            url,
            (w, h) => {
                if (w > 0) setImageHeight((CARD_CONTENT_WIDTH / w) * h);
            },
            () => setImageHeight(CARD_CONTENT_WIDTH)
        );
    };

    const loadPreview = async () => {
        const v = link.trim();
        if (!v) { setError("Paste your Luma event link"); return; }
        if (!isProbablyLumaEventUrl(v)) { setError("Link should look like https://lu.ma/…"); return; }
        setError(null);
        Keyboard.dismiss();
        setIsLoading(true);
        setDescExpanded(false);
        setImageHeight(null);
        try {
            const res = await previewLumaEvent(v);
            setPreview(res.event);
            setCode(res.code);
            setVerified(null);
            setEditedDescription(res.event?.description || "");
            if (res.event && res.event.location && res.event.location.lat && res.event.location.lng) {
                setLat(res.event.location.lat);
                setLng(res.event.location.lng);
            }
            if (res.event?.cover_image) {
                resolveImageHeight(res.event.cover_image.replace(/^http:\/\//i, "https://"));
            }
        } catch (e) {
            setPreview(null);
            setCode(null);
            setError(extractApiError(e, "Failed to fetch event. Check the link and try again."));
        } finally {
            setIsLoading(false);
        }
    };

    const verify = async () => {
        const v = link.trim();
        if (!v || !code) return;
        setIsLoading(true);
        try {
            const res = await verifyLumaEvent(v);
            setPreview(res.event);
            setCode(res.code);
            setVerified(res.verified);
            setEditedDescription(res.event?.description || "");
            if (res.verified) {
                await storage.setItem("events.luma_link", v);
                onSaved?.(v);
            }
        } catch (e) {
            setError(extractApiError(e, "Verify failed. Try again."));
            setVerified(null);
        } finally {
            setIsLoading(false);
        }
    };

    const createEvent = async () => {
        if (createEventState === "posting" || createEventState === "minting" || createEventState === "success") {
            return;
        };

        const data: LumaEvent = {
            is_luma_event: true,
            luma_event_url: link,
            luma_event_verified: verified || false,
            luma_event_start_time: preview?.start_time || undefined,
            luma_event_end_time: preview?.end_time || undefined,
        };

        setCreateEventState("posting");
        setError(null);

        const locString = formatLocation(preview?.location) || "Online";

        if (locString === "Online") {
            setCreateEventState("error");
            setError("Online events are not supported yet.");
            return;
        };

        try {
            const postCreateResponse = await createPost(
                editedDescription,
                coverUrl ? [coverUrl] : [],
                locString,
                (lat !== null && lng !== null) ? { lat, lng } : undefined,
                11,
                false,
                true,
                data,
            );

            if (postCreateResponse.success) {
                setCreateEventState("minting");
                while (true) {
                    const mintNftResponse = await mintNFT("", Number(postCreateResponse.postId), 0, "");
                    if (mintNftResponse.success) {
                        setCreateEventState("success");
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        setTimeout(() => bottomSheetModalRef.current?.dismiss(), 2000);
                        break;
                    } else if (mintNftResponse.error === "Post is not approved.") {
                        await new Promise(res => setTimeout(res, 3000));
                        continue;
                    } else {
                        setCreateEventState("error");
                        setError(extractApiError(mintNftResponse, mintNftResponse.error || "Failed to mint NFT"));
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                        break;
                    }
                }
            } else {
                setCreateEventState("error");
                setError(postCreateResponse.message || "Failed to create post");
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
        } catch (err) {
            setCreateEventState("error");
            setError(extractApiError(err, "An unexpected error occurred"));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    };

    const coverUrl = preview?.cover_image
        ? preview.cover_image.replace(/^http:\/\//i, "https://")
        : null;

    return (
        <BottomSheetModal
            ref={bottomSheetModalRef}
            snapPoints={snapPoints}
            index={0}
            backdropComponent={backdrop}
            backgroundStyle={{ backgroundColor: bg }}
            handleIndicatorStyle={{
                backgroundColor: isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.16)",
                width: 36,
            }}
            onDismiss={() => {
                setError(null);
                setPreview(null);
                setCode(null);
                setVerified(null);
                setDescExpanded(false);
                setImageHeight(null);
                setEditedDescription("");
            }}
        >
            <BottomSheetView style={[styles.container, { backgroundColor: bg }]}>

                {/* ── Header ── */}
                <View style={styles.header}>
                    <View style={[styles.iconBadge, {
                        backgroundColor: isDark ? "rgba(168,85,247,0.14)" : "rgba(168,85,247,0.12)",
                        borderColor: border,
                    }]}>
                        <Link2 size={18} color={accent} strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.title, { color: main }]}>Add Luma event</Text>
                        <Text style={[styles.subtitle, { color: muted }]}>
                            Paste a link to your active Luma event.
                        </Text>
                    </View>
                </View>

                {/* ── URL Input ── */}
                <Pressable onPress={() => Keyboard.dismiss()}>
                    <View style={[styles.inputWrap, { backgroundColor: inputBg, borderColor: border }]}>
                        <TextInput
                            value={link}
                            onChangeText={(t) => {
                                if (code) return;
                                setLink(t);
                                if (error) setError(null);
                                setPreview(null);
                                setCode(null);
                                setVerified(null);
                                setDescExpanded(false);
                                setImageHeight(null);
                                setEditedDescription("");
                            }}
                            placeholder="https://luma.com/your-event"
                            placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)"}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                            returnKeyType="done"
                            onSubmitEditing={loadPreview}
                            style={[styles.input, { color: main }]}
                        />
                    </View>
                </Pressable>

                {code ? (
                    <TouchableOpacity
                        onPress={() => {
                            setPreview(null);
                            setCode(null);
                            setVerified(null);
                            setDescExpanded(false);
                            setImageHeight(null);
                            setEditedDescription("");
                            setLink("");
                        }}
                        style={{ marginTop: 6, alignSelf: "flex-end" }}
                        activeOpacity={0.7}
                    >
                        <Text style={{ fontFamily: "Dank Mono", fontSize: 11, color: muted }}>↩ Change link</Text>
                    </TouchableOpacity>
                ) : null}

                {error ? (
                    <Text style={[styles.error, { color: isDark ? "#FCA5A5" : "#DC2626" }]}>{error}</Text>
                ) : null}

                {/* ── Preview Card ── */}
                {preview && code ? (
                    <View style={[styles.previewCard, { backgroundColor: inputBg, borderColor: border }]}>

                        {coverUrl ? (
                            imageHeight === null ? (
                                <View style={[styles.imagePlaceholder, {
                                    backgroundColor: isDark ? "rgba(168,85,247,0.14)" : "rgba(168,85,247,0.08)",
                                }]} />
                            ) : (
                                <Image
                                    source={{ uri: coverUrl }}
                                    style={[styles.previewImage, { height: imageHeight }]}
                                    resizeMode="cover"
                                />
                            )
                        ) : null}

                        <View style={styles.previewBody}>
                            <Text style={[styles.previewTitle, { color: main }]}>
                                {preview.title || "Luma event"}
                            </Text>
                            {(preview.start_time || preview.end_time) ? (
                                <View style={styles.metaRow}>
                                    <Calendar size={12} color={muted} strokeWidth={1.8} />
                                    <Text style={[styles.metaText, { color: muted }]}>
                                        {formatEventDate(preview.start_time)}
                                        {preview.end_time ? ` → ${formatEventDate(preview.end_time)}` : ""}
                                    </Text>
                                </View>
                            ) : null}

                            {(() => {
                                const loc = formatLocation(preview.location);
                                return (
                                    <View style={{ flexDirection: "column" }}>
                                        {loc ? (
                                            <View style={styles.metaRow}>
                                                <MapPin size={12} color={muted} strokeWidth={1.8} />
                                                <Text style={[styles.metaText, { color: muted }]} numberOfLines={1}>{loc}</Text>
                                            </View>
                                        ) : preview.location?.url ? (
                                            <View style={styles.metaRow}>
                                                <MapPin size={12} color={muted} strokeWidth={1.8} />
                                                <Text style={[styles.metaText, { color: muted }]}>Online</Text>
                                            </View>
                                        ) : null}
                                    </View>
                                );
                            })()}
                            {verified === true ? (
                                <View style={{ marginTop: 10 }}>
                                    <Text style={[styles.metaText, { color: accent, marginBottom: 4, fontFamily: "Dank Mono Bold" }]}>
                                        Edit Description
                                    </Text>
                                    <TextInput
                                        value={editedDescription}
                                        onChangeText={setEditedDescription}
                                        multiline
                                        style={[
                                            styles.previewDesc,
                                            {
                                                color: main,
                                                backgroundColor: inputBg,
                                                padding: 12,
                                                borderRadius: 12,
                                                borderWidth: 1,
                                                borderColor: border,
                                                minHeight: 80,
                                                textAlignVertical: "top",
                                            }
                                        ]}
                                        placeholder="Event description..."
                                        placeholderTextColor={muted}
                                    />
                                </View>
                            ) : preview.description ? (
                                <>
                                    <Text
                                        numberOfLines={descExpanded ? undefined : 3}
                                        style={[styles.previewDesc, { color: muted }]}
                                    >
                                        {preview.description}
                                    </Text>
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => setDescExpanded((v) => !v)}
                                        style={styles.readMoreBtn}
                                    >
                                        <Text style={[styles.readMoreText, { color: accent }]}>
                                            {descExpanded ? "Collapse ▲" : "Read more ▼"}
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            ) : null}

                            <View style={[styles.divider, { backgroundColor: border }]} />

                            <View style={styles.codeRow}>
                                <Text style={[styles.codeLabel, { color: muted }]}>Verification code</Text>
                                <Text style={[styles.codeValue, { color: accent }]}>{code}</Text>
                            </View>
                            <Text style={[styles.hint, { color: muted }]}>
                                Paste this code into your Luma event description, then tap Verify.
                            </Text>

                            {verified === true ? (
                                <Text style={[styles.verifiedOk, { color: isDark ? "#6EE7B7" : "#059669" }]}>
                                    Verified! ✓
                                </Text>
                            ) : verified === false ? (
                                <Text style={[styles.verifiedBad, { color: isDark ? "#FCA5A5" : "#DC2626" }]}>
                                    Code not found in description yet.
                                </Text>
                            ) : null}
                        </View>
                    </View>
                ) : null}

                {/* ── CTA ── */}
                {verified === true ? (
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={createEvent}
                        disabled={createEventState === "posting" || createEventState === "minting" || createEventState === "success"}
                        style={[
                            styles.cta,
                            {
                                backgroundColor: createEventState === "success" ? (isDark ? "#059669" : "#10B981") : accent,
                                borderColor: createEventState === "success" ? (isDark ? "#059669" : "#10B981") : accent,
                                shadowColor: createEventState === "success" ? "#10B981" : accent,
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.4,
                                shadowRadius: 8,
                                elevation: 5,
                            },
                            (createEventState === "posting" || createEventState === "minting") ? { opacity: 0.7 } : null
                        ]}
                    >
                        <Text style={[styles.ctaText, { color: "#ffffff", fontSize: 15 }]}>
                            {createEventState === "posting" ? "Creating post..." :
                                createEventState === "minting" ? "Minting cNFT..." :
                                    createEventState === "success" ? "Success! ✓" :
                                        "Create post and cNFT mint ✦"}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={preview && code ? verify : loadPreview}
                        disabled={isLoading}
                        style={[
                            styles.cta,
                            {
                                backgroundColor: "rgba(168,85,247,0.16)",
                                borderColor: "rgba(168,85,247,0.35)",
                            },
                            isLoading ? { opacity: 0.7 } : null,
                        ]}
                    >
                        <Text style={[styles.ctaText, { color: accent }]}>
                            {isLoading ? "Loading..." : preview && code ? "Verify" : "Fetch event"}
                        </Text>
                    </TouchableOpacity>
                )}
            </BottomSheetView>
        </BottomSheetModal>
    );
});

AddLumaEventSheet.displayName = "AddLumaEventSheet";

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 22,
        paddingTop: 10,
        paddingBottom: 24,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        marginBottom: 18,
    },
    iconBadge: {
        width: 40,
        height: 40,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    title: {
        fontFamily: "Dank Mono Bold",
        fontSize: 16,
        includeFontPadding: false,
    },
    subtitle: {
        fontFamily: "Dank Mono",
        fontSize: 12,
        marginTop: 4,
        includeFontPadding: false,
    },
    inputWrap: {
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    input: {
        fontFamily: "Dank Mono",
        fontSize: 14,
        includeFontPadding: false,
    },
    error: {
        marginTop: 10,
        fontFamily: "Dank Mono",
        fontSize: 12,
    },
    previewCard: {
        marginTop: 14,
        borderWidth: 1,
        borderRadius: 18,
    },
    imagePlaceholder: {
        width: "100%",
        height: 160,
        borderTopLeftRadius: 17,
        borderTopRightRadius: 17,
    },
    previewImage: {
        width: "100%",
        borderTopLeftRadius: 17,
        borderTopRightRadius: 17,
    },
    previewBody: {
        padding: CARD_PADDING,
    },
    previewTitle: {
        fontFamily: "Dank Mono Bold",
        fontSize: 15,
        includeFontPadding: false,
    },
    previewDesc: {
        marginTop: 6,
        fontFamily: "Dank Mono",
        fontSize: 12,
        lineHeight: 18,
        includeFontPadding: false,
    },
    readMoreBtn: {
        marginTop: 6,
        alignSelf: "flex-start",
    },
    readMoreText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 11,
        includeFontPadding: false,
        letterSpacing: 0.3,
    },
    divider: {
        height: 1,
        marginVertical: 12,
        borderRadius: 1,
    },
    codeRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    codeLabel: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        includeFontPadding: false,
        letterSpacing: 0.4,
    },
    codeValue: {
        fontFamily: "Dank Mono Bold",
        fontSize: 16,
        includeFontPadding: false,
        letterSpacing: 1.2,
    },
    hint: {
        marginTop: 8,
        fontFamily: "Dank Mono",
        fontSize: 11,
        lineHeight: 16,
        includeFontPadding: false,
    },
    verifiedOk: {
        marginTop: 10,
        fontFamily: "Dank Mono Bold",
        fontSize: 12,
        includeFontPadding: false,
    },
    verifiedBad: {
        marginTop: 10,
        fontFamily: "Dank Mono Bold",
        fontSize: 12,
        includeFontPadding: false,
    },
    cta: {
        marginTop: 16,
        borderWidth: 1,
        borderRadius: 16,
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    ctaText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 14,
        includeFontPadding: false,
    },
    metaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        marginTop: 6,
    },
    metaText: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        includeFontPadding: false,
        flex: 1,
    },
});

export default AddLumaEventSheet;