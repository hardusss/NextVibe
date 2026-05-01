import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Image, Pressable, TouchableOpacity } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { getVibemapNfts, VibemapNftItem } from '@/src/api/get.vibemap.nfts';
import { getVibemapEvents, VibemapEventItem } from '@/src/api/get.vibemap.events';
import EventDetailSheet, { EventDetailSheetRef } from './EventDetailSheet';
import * as Haptics from 'expo-haptics';
import { Camera, Calendar, Moon, Map as LucideMap } from 'lucide-react-native';

type FilterMode = 'posts' | 'events';
type MapStyle = 'dark' | 'street';

const EMPTY_GEOJSON = {
    type: "FeatureCollection" as const,
    features: [] as any[],
};

export default function MapScreen() {
    const [showMap, setShowMap] = useState(false);
    const [userCoords, setUserCoords] = useState<[number, number]>([24.03, 49.84]);
    const [nfts, setNfts] = useState<VibemapNftItem[]>([]);
    const [events, setEvents] = useState<VibemapEventItem[]>([]);
    const [isNftsLoading, setIsNftsLoading] = useState(false);
    const [isEventsLoading, setIsEventsLoading] = useState(false);

    const [filterMode, setFilterMode] = useState<FilterMode>('posts');
    const [mapStyle, setMapStyle] = useState<MapStyle>('dark');

    const eventSheetRef = useRef<EventDetailSheetRef>(null);

    const getUserLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;

            const data = await Location.getCurrentPositionAsync({ 
                accuracy: Location.Accuracy.Low 
            });

            if (data.coords) {
                setUserCoords([data.coords.longitude, data.coords.latitude]);
            }
        } catch (error) {
            console.error("Location error:", error);
        }
    };

    useEffect(() => {
        getUserLocation();
    }, []);

    const loadNfts = useCallback(async () => {
        setIsNftsLoading(true);
        try {
            const data = await getVibemapNfts();
            setNfts(data);
        } catch (e) {
            console.error("get vibemap nfts error:", e);
            setNfts([]);
        } finally {
            setIsNftsLoading(false);
        }
    }, []);

    const loadEvents = useCallback(async () => {
        setIsEventsLoading(true);
        try {
            const data = await getVibemapEvents();
            setEvents(data);
        } catch (e) {
            console.error("get vibemap events error:", e);
            setEvents([]);
        } finally {
            setIsEventsLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            const timer = setTimeout(() => {
                setShowMap(true);
            }, 450);

            loadNfts();
            loadEvents();

            return () => {
                setShowMap(false);
                clearTimeout(timer);
            };
        }, [loadNfts, loadEvents])
    );

    const mapNfts = useMemo(() => {
        return nfts.filter((x) => typeof x.lat === "number" && typeof x.lng === "number");
    }, [nfts]);

    const mapEvents = useMemo(() => {
        return events.filter((x) => typeof x.lat === "number" && typeof x.lng === "number");
    }, [events]);

    const showPosts = filterMode === 'posts';
    const showEvents = filterMode === 'events';

    const nftsGeoJson = useMemo(() => {
        if (!showPosts) return EMPTY_GEOJSON;
        return {
            type: "FeatureCollection" as const,
            features: mapNfts.map((item) => ({
                type: "Feature" as const,
                geometry: {
                    type: "Point" as const,
                    coordinates: [item.lng as number, item.lat as number],
                },
                properties: {
                    post_id: item.post_id,
                },
            })),
        };
    }, [mapNfts, showPosts]);

    const eventsGeoJson = useMemo(() => {
        if (!showEvents) return EMPTY_GEOJSON;
        return {
            type: "FeatureCollection" as const,
            features: mapEvents.map((item) => ({
                type: "Feature" as const,
                geometry: {
                    type: "Point" as const,
                    coordinates: [item.lng, item.lat],
                },
                properties: {
                    post_id: item.post_id,
                    is_active: item.is_active,
                },
            })),
        };
    }, [mapEvents, showEvents]);

    const isLoading = isNftsLoading || isEventsLoading;

    const currentStyleURL = mapStyle === 'dark'
        ? MapboxGL.StyleURL.Dark
        : MapboxGL.StyleURL.Street;

    const isDarkMap = mapStyle === 'dark';

    const handleFilterChange = (mode: FilterMode) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setFilterMode(mode);
    };

    const handleMapStyleChange = (style: MapStyle) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setMapStyle(style);
    };

    return (
        <View style={styles.container}>
            <StatusBar translucent backgroundColor='#000000'/>
            {showMap ? (
                <>
                    <MapboxGL.MapView
                        style={styles.map}
                        styleURL={currentStyleURL}
                        projection={isDarkMap ? "globe" : "mercator"}
                        logoEnabled={false}
                        attributionEnabled={false}
                        scaleBarEnabled={false}
                    >
                        <MapboxGL.Camera
                            defaultSettings={{
                                centerCoordinate: [0, 0],
                                zoomLevel: 1,
                            }}
                            centerCoordinate={userCoords}
                            zoomLevel={isDarkMap ? 3.5 : 16}
                            pitch={isDarkMap ? 45 : 60}
                            animationDuration={3500}
                            animationMode="flyTo"
                        />

                        {isDarkMap && (
                            <MapboxGL.Atmosphere
                                style={{
                                    color: '#000000',
                                    highColor: '#52059f',
                                    spaceColor: '#000000',
                                    horizonBlend: 0.02,
                                    starIntensity: 1.0
                                }}
                            />
                        )}

                        {/* NFT halo layer */}
                        <MapboxGL.ShapeSource id="vibemap-nfts" shape={nftsGeoJson}>
                            <MapboxGL.CircleLayer
                                id="vibemap-nfts-halo"
                                style={{
                                    circleColor: "#BCBBFD",
                                    circleOpacity: [
                                        "interpolate",
                                        ["linear"],
                                        ["zoom"],
                                        0, 0.55,
                                        3, 0.35,
                                        6, 0.2,
                                        10, 0.0,
                                    ],
                                    circleRadius: [
                                        "interpolate",
                                        ["linear"],
                                        ["zoom"],
                                        0, 18,
                                        2, 14,
                                        4, 10,
                                        6, 7,
                                        8, 5,
                                        10, 3,
                                    ],
                                    circleBlur: 1,
                                    circleStrokeWidth: 1,
                                    circleStrokeColor: "rgba(82, 5, 159, 0.85)",
                                    circleStrokeOpacity: [
                                        "interpolate",
                                        ["linear"],
                                        ["zoom"],
                                        0, 0.75,
                                        6, 0.35,
                                        10, 0.0,
                                    ],
                                }}
                            />
                        </MapboxGL.ShapeSource>

                        {/* Event halo layer — distinct green/cyan glow */}
                        <MapboxGL.ShapeSource id="vibemap-events-halo-source" shape={eventsGeoJson}>
                            <MapboxGL.CircleLayer
                                id="vibemap-events-halo"
                                style={{
                                    circleColor: [
                                        "case",
                                        ["==", ["get", "is_active"], true],
                                        "#05f0d8",
                                        "#f87171",
                                    ],
                                    circleOpacity: [
                                        "interpolate",
                                        ["linear"],
                                        ["zoom"],
                                        0, 0.6,
                                        3, 0.4,
                                        6, 0.25,
                                        10, 0.0,
                                    ],
                                    circleRadius: [
                                        "interpolate",
                                        ["linear"],
                                        ["zoom"],
                                        0, 22,
                                        2, 18,
                                        4, 14,
                                        6, 10,
                                        8, 7,
                                        10, 4,
                                    ],
                                    circleBlur: 1,
                                    circleStrokeWidth: 1.5,
                                    circleStrokeColor: [
                                        "case",
                                        ["==", ["get", "is_active"], true],
                                        "rgba(5, 240, 216, 0.85)",
                                        "rgba(248, 113, 113, 0.6)",
                                    ],
                                    circleStrokeOpacity: [
                                        "interpolate",
                                        ["linear"],
                                        ["zoom"],
                                        0, 0.8,
                                        6, 0.4,
                                        10, 0.0,
                                    ],
                                }}
                            />
                        </MapboxGL.ShapeSource>

                        {isDarkMap && (
                            <MapboxGL.VectorSource id="vibe-borders" url="mapbox://mapbox.mapbox-streets-v8">
                                <MapboxGL.LineLayer
                                    id="neon-borders"
                                    sourceLayerID="admin"
                                    filter={['all', ['==', ['get', 'admin_level'], 0], ['==', ['get', 'maritime'], 0]]}
                                    style={{
                                        lineColor: '#4e158b',
                                        lineWidth: ['interpolate', ['linear'], ['zoom'], 1, 0.5, 5, 2],
                                        lineOpacity: 0.9,
                                        lineBlur: 0.5,
                                    }}
                                />

                                <MapboxGL.LineLayer
                                    id="neon-sub-borders"
                                    sourceLayerID="admin"
                                    filter={['all', ['==', ['get', 'admin_level'], 1], ['==', ['get', 'maritime'], 0]]}
                                    style={{
                                        lineColor: '#4e158b',
                                        lineWidth: 0.5,
                                        lineOpacity: ['interpolate', ['linear'], ['zoom'], 3, 0, 5, 0.5],
                                        lineDasharray: [2, 2],
                                    }}
                                />
                            </MapboxGL.VectorSource>
                        )}

                        {/* NFT markers */}
                        {showPosts && mapNfts.map((item) => (
                            <MapboxGL.MarkerView
                                key={String(item.post_id)}
                                id={`vibemap-nft-${item.post_id}`}
                                coordinate={[item.lng as number, item.lat as number]}
                                anchor={{ x: 0.5, y: 0.5 }}
                                allowOverlap
                            >
                                <Pressable style={styles.markerShadowWrap}>
                                    <View style={styles.markerContainer}>
                                        {item.image ? (
                                            <Image
                                                source={{ uri: item.image }}
                                                style={styles.markerPostImage}
                                                resizeMode="cover"
                                            />
                                        ) : (
                                            <View style={styles.markerPostFallback} />
                                        )}

                                        <View style={styles.markerAvatarRing}>
                                            {item.owner_avatar ? (
                                                <Image
                                                    source={{ uri: item.owner_avatar }}
                                                    style={styles.markerAvatar}
                                                    resizeMode="cover"
                                                />
                                            ) : (
                                                <View style={styles.markerAvatarFallback} />
                                            )}
                                        </View>
                                    </View>
                                </Pressable>
                            </MapboxGL.MarkerView>
                        ))}

                        {/* Event markers — distinct look */}
                        {showEvents && mapEvents.map((item) => (
                            <MapboxGL.MarkerView
                                key={`event-${item.post_id}`}
                                id={`vibemap-event-${item.post_id}`}
                                coordinate={[item.lng, item.lat]}
                                anchor={{ x: 0.5, y: 0.5 }}
                                allowOverlap
                            >
                                <Pressable
                                    style={[
                                        styles.eventMarkerShadow,
                                        { shadowColor: item.is_active ? "#05f0d8" : "#f87171" },
                                    ]}
                                    onPress={() => eventSheetRef.current?.present(item)}
                                >
                                    <View style={[
                                        styles.eventMarkerContainer,
                                        {
                                            borderColor: item.is_active
                                                ? "rgba(5, 240, 216, 0.6)"
                                                : "rgba(248, 113, 113, 0.4)",
                                        },
                                    ]}>
                                        {/* Event image */}
                                        {item.image ? (
                                            <Image
                                                source={{ uri: item.image }}
                                                style={styles.eventMarkerImage}
                                                resizeMode="cover"
                                            />
                                        ) : (
                                            <View style={styles.eventMarkerImageFallback} />
                                        )}

                                        {/* Calendar icon overlay */}
                                        <View style={styles.eventIconOverlay}>
                                            <View style={[
                                                styles.eventIconBadge,
                                                {
                                                    backgroundColor: item.is_active
                                                        ? "rgba(5, 240, 216, 0.9)"
                                                        : "rgba(248, 113, 113, 0.85)",
                                                },
                                            ]}>
                                                <Text style={styles.eventIconEmoji}>📅</Text>
                                            </View>
                                        </View>

                                        {/* Status dot */}
                                        <View style={[
                                            styles.eventStatusDot,
                                            {
                                                backgroundColor: item.is_active ? "#05f0d8" : "#f87171",
                                                borderColor: "#000",
                                            },
                                        ]} />
                                    </View>
                                </Pressable>
                            </MapboxGL.MarkerView>
                        ))}

                        {isLoading ? (
                            <View style={styles.mapLoadingBadge}>
                                <ActivityIndicator size="small" color="#BCBBFD" />
                                <Text style={styles.mapLoadingText}>Loading drops…</Text>
                            </View>
                        ) : null}
                    </MapboxGL.MapView>

                    {/* ── Floating control panel ── */}
                    <View style={styles.controlsContainer}>
                        {/* Filter toggle: All / Posts / Events */}
                        <View style={styles.pillRow}>
                            {(['posts', 'events'] as FilterMode[]).map((mode) => {
                                const isActive = filterMode === mode;
                                const Icon = mode === 'posts' ? Camera : Calendar;
                                const label = mode === 'posts' ? 'Posts' : 'Events';
                                
                                return (
                                    <TouchableOpacity
                                        key={mode}
                                        activeOpacity={0.78}
                                        onPress={() => handleFilterChange(mode)}
                                        style={[
                                            styles.pillBtn,
                                            isActive && styles.pillBtnActive,
                                        ]}
                                    >
                                        <View style={styles.btnContent}>
                                            <Icon 
                                                size={14} 
                                                color={isActive ? "#FFFFFF" : "rgba(255, 255, 255, 0.45)"} 
                                                strokeWidth={2.5}
                                            />
                                            <Text style={[
                                                styles.pillText,
                                                isActive && styles.pillTextActive,
                                            ]}>
                                                {label}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Map style toggle: Dark / Street */}
                        <View style={styles.pillRow}>
                            {(['dark', 'street'] as MapStyle[]).map((style) => {
                                const isActive = mapStyle === style;
                                const Icon = style === 'dark' ? Moon : LucideMap;
                                const label = style === 'dark' ? 'Vibe' : '3D Street';

                                return (
                                    <TouchableOpacity
                                        key={style}
                                        activeOpacity={0.78}
                                        onPress={() => handleMapStyleChange(style)}
                                        style={[
                                            styles.pillBtn,
                                            styles.pillBtnSmall,
                                            isActive && styles.pillBtnActive,
                                        ]}
                                    >
                                        <View style={styles.btnContent}>
                                            <Icon 
                                                size={14} 
                                                color={isActive ? "#FFFFFF" : "rgba(255, 255, 255, 0.45)"} 
                                                strokeWidth={2.5}
                                            />
                                            <Text style={[
                                                styles.pillText,
                                                isActive && styles.pillTextActive,
                                            ]}>
                                                {label}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                </>
            ) : (
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color="#BCBBFD" />
                    <Text style={styles.loaderText}>Mapping the VibeWorld...</Text>
                </View>
            )}

            <EventDetailSheet ref={eventSheetRef} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: '#000000' 
    },
    loader: { 
        flex: 1, 
        backgroundColor: '#000000', 
        justifyContent: 'center', 
        alignItems: 'center' 
    },
    loaderText: { 
        color: '#BCBBFD', 
        fontSize: 12, 
        marginTop: 15, 
        letterSpacing: 3, 
        textTransform: 'uppercase' 
    },
    map: { flex: 1 },

    mapLoadingBadge: {
        position: "absolute",
        top: 58,
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: "rgba(10, 4, 16, 0.75)",
        borderWidth: 1,
        borderColor: "rgba(188, 187, 253, 0.25)",
    },
    mapLoadingText: {
        color: "#BCBBFD",
        fontSize: 12,
        letterSpacing: 0.2,
    },

    // ── Floating controls ────────────────────────
    controlsContainer: {
        position: "absolute",
        top: 54,
        left: 0,
        right: 0,
        alignItems: "center",
        gap: 8,
    },
    pillRow: {
        flexDirection: "row",
        backgroundColor: "rgba(10, 4, 16, 0.78)",
        borderRadius: 14,
        padding: 3,
        borderWidth: 1,
        borderColor: "rgba(168, 85, 247, 0.2)",
    },
    pillBtn: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 11,
    },
    pillBtnSmall: {
        paddingHorizontal: 16,
    },
    btnContent: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    pillBtnActive: {
        backgroundColor: "rgba(168, 85, 247, 0.28)",
    },
    pillText: {
        color: "rgba(255, 255, 255, 0.45)",
        fontFamily: "Dank Mono Bold",
        fontSize: 12,
        includeFontPadding: false,
    },
    pillTextActive: {
        color: "#FFFFFF",
    },

    // ── NFT markers ──────────────────────────────
    markerContainer: {
        width: 54,
        height: 76,
        borderRadius: 12,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(82, 5, 159, 0.18)",
        borderWidth: 1,
        borderColor: "rgba(188, 187, 253, 0.18)",
    },
    markerShadowWrap: {
        borderRadius: 12,
        shadowColor: "#A855F7",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 18,
        elevation: 10,
    },
    markerPostImage: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 12,
    },
    markerPostFallback: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(82, 5, 159, 0.22)",
    },
    markerAvatarRing: {
        width: 34,
        height: 34,
        borderRadius: 999,
        backgroundColor: "rgba(0,0,0,0.6)",
        borderWidth: 2,
        borderColor: "#A855F7",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#A855F7",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
    },
    markerAvatar: {
        width: 30,
        height: 30,
        borderRadius: 999,
        backgroundColor: "#111",
    },
    markerAvatarFallback: {
        width: 30,
        height: 30,
        borderRadius: 999,
        backgroundColor: "rgba(188, 187, 253, 0.22)",
    },

    // ── Event markers ──────────────────────────────
    eventMarkerShadow: {
        borderRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 12,
    },
    eventMarkerContainer: {
        width: 62,
        height: 62,
        borderRadius: 16,
        overflow: "hidden",
        borderWidth: 2,
        backgroundColor: "rgba(5, 240, 216, 0.08)",
    },
    eventMarkerImage: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 14,
    },
    eventMarkerImageFallback: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(5, 240, 216, 0.12)",
    },
    eventIconOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    eventIconBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    eventIconEmoji: {
        fontSize: 14,
        includeFontPadding: false,
    },
    eventStatusDot: {
        position: "absolute",
        top: -3,
        right: -3,
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 2,
    },
});