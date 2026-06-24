import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    StyleSheet, View, Text, ActivityIndicator, Image,
    Pressable, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapboxGL from '@rnmapbox/maps';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { getVibemapNfts, VibemapNftItem } from '@/src/api/get.vibemap.nfts';
import { getVibemapEvents, VibemapEventItem } from '@/src/api/get.vibemap.events';
import EventDetailSheet, { EventDetailSheetRef } from './EventDetailSheet';
import * as Haptics from 'expo-haptics';
import { Camera, Calendar, Moon, Map as LucideMap, MapPin, Compass, Info } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withDelay,
    withSequence,
    withSpring,
    Easing,
} from 'react-native-reanimated';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterMode = 'posts' | 'events';
type MapStyle = 'dark' | 'street';

// ─── Cluster config ──────────────────────────────────────────────────────────

const CLUSTER_RADIUS = 50;     // px radius to merge nearby markers
const CLUSTER_MAX_ZOOM = 14;   // stop clustering above this zoom

const EMPTY_GEOJSON = {
    type: 'FeatureCollection' as const,
    features: [] as any[],
};

// ─── Helper UI components for Redesign ───────────────────────────────────────

function FilterPill({
    isActive,
    Icon,
    label,
    onPress,
    gradientColors,
}: {
    isActive: boolean;
    Icon: any;
    label: string;
    onPress: () => void;
    gradientColors: readonly [string, string, ...string[]];
}) {
    const scale = useSharedValue(isActive ? 1 : 0.95);
    const opacity = useSharedValue(isActive ? 1 : 0);

    useEffect(() => {
        scale.value = withSpring(isActive ? 1 : 0.95, { damping: 15, stiffness: 120 });
        opacity.value = withTiming(isActive ? 1 : 0, { duration: 250 });
    }, [isActive]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={onPress}
            style={styles.pill}
        >
            <Animated.View style={[StyleSheet.absoluteFillObject, animatedStyle, { borderRadius: 11, overflow: 'hidden' }]}>
                <LinearGradient
                    colors={gradientColors}
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />
            </Animated.View>
            <Icon
                size={13}
                color={isActive ? '#fff' : 'rgba(255,255,255,0.4)'}
                strokeWidth={2.5}
            />
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}

function LiveBadge() {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(0.9);

    useEffect(() => {
        scale.value = withRepeat(
            withSequence(
                withTiming(1.15, { duration: 800, easing: Easing.inOut(Easing.ease) }),
                withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
        opacity.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 800 }),
                withTiming(0.65, { duration: 800 })
            ),
            -1,
            true
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View style={[styles.eventLiveBadge, animatedStyle]}>
            <Text style={styles.eventLiveText}>LIVE</Text>
        </Animated.View>
    );
}

function UserLocationBeacon() {
    const pulse = useSharedValue(0.4);
    const opacity = useSharedValue(0.8);

    useEffect(() => {
        pulse.value = withRepeat(
            withTiming(1.8, { duration: 2000, easing: Easing.out(Easing.quad) }),
            -1,
            false
        );
        opacity.value = withRepeat(
            withTiming(0, { duration: 2000, easing: Easing.out(Easing.quad) }),
            -1,
            false
        );
    }, []);

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulse.value }],
        opacity: opacity.value,
    }));

    return (
        <View style={styles.userBeaconContainer}>
            <Animated.View style={[styles.userBeaconPulse, pulseStyle]} />
            <View style={styles.userBeaconCenter} />
        </View>
    );
}

function RadarSweep() {
    const rotation = useSharedValue(0);
    useEffect(() => {
        rotation.value = withRepeat(
            withTiming(360, { duration: 3200, easing: Easing.linear }),
            -1,
            false
        );
    }, []);
    const sweepStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));
    return (
        <Animated.View style={[styles.sweepContainer, sweepStyle]} pointerEvents="none">
            <LinearGradient
                colors={['rgba(168, 85, 247, 0.55)', 'rgba(168, 85, 247, 0)']}
                style={styles.sweepLine}
            />
        </Animated.View>
    );
}

// ─── Markers ─────────────────────────────────────────────────────────────────

function NftMarker({ item, onPress }: { item: VibemapNftItem; onPress: () => void }) {
    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
    };
    return (
        <Pressable onPress={handlePress} style={styles.markerHitArea}>
            <View style={[styles.nftCard, styles.nftCardGlow]}>
                {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.nftCardImage} resizeMode="cover" />
                ) : (
                    <View style={styles.nftCardFallback} />
                )}
                <View style={styles.nftCardBorder} />
                
                <View style={styles.nftSparkleBadge}>
                    <Text style={styles.nftSparkleText}>✨</Text>
                </View>

                <View style={styles.nftAvatarRing}>
                    {item.owner_avatar ? (
                        <Image source={{ uri: item.owner_avatar }} style={styles.nftAvatar} resizeMode="cover" />
                    ) : (
                        <View style={styles.nftAvatarFallback}>
                            <Camera size={10} color="rgba(168,85,247,0.8)" />
                        </View>
                    )}
                </View>
            </View>
        </Pressable>
    );
}

// ─── Static Regular Post marker ──────────────────────────────────────────────

function PostMarker({ item, onPress }: { item: VibemapNftItem; onPress: () => void }) {
    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
    };
    return (
        <Pressable onPress={handlePress} style={styles.markerHitArea}>
            <View style={styles.postCard}>
                {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.postCardImage} resizeMode="cover" />
                ) : (
                    <View style={styles.postCardFallback} />
                )}
                <View style={styles.postCardBorder} />
                <View style={styles.postAvatarRing}>
                    {item.owner_avatar ? (
                        <Image source={{ uri: item.owner_avatar }} style={styles.postAvatar} resizeMode="cover" />
                    ) : (
                        <View style={styles.postAvatarFallback}>
                            <Camera size={8} color="rgba(255,255,255,0.7)" />
                        </View>
                    )}
                </View>
            </View>
        </Pressable>
    );
}

// ─── Static Event marker ─────────────────────────────────────────────────────

function EventMarker({ item, onPress }: { item: VibemapEventItem; onPress: () => void }) {
    const isActive = item.is_active;
    const glowColor = isActive ? '#05f0d8' : '#f87171';

    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
    };

    return (
        <Pressable onPress={handlePress} style={styles.markerHitArea}>
            <View style={[
                styles.eventCard,
                { borderColor: isActive ? 'rgba(5,240,216,0.65)' : 'rgba(248,113,113,0.45)' },
                isActive ? styles.eventCardGlowActive : styles.eventCardGlowEnded,
            ]}>
                {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.eventCardImage} resizeMode="cover" />
                ) : (
                    <View style={[styles.eventCardFallback, {
                        backgroundColor: isActive ? 'rgba(5,240,216,0.12)' : 'rgba(248,113,113,0.12)',
                    }]} />
                )}

                <LinearGradient
                    colors={isActive
                        ? ['transparent', 'rgba(5,240,216,0.3)']
                        : ['transparent', 'rgba(248,113,113,0.3)']}
                    style={StyleSheet.absoluteFillObject}
                />

                <View style={[styles.eventBadge, {
                    backgroundColor: isActive ? 'rgba(5,240,216,0.9)' : 'rgba(248,113,113,0.85)',
                }]}>
                    <Calendar size={10} color="#000" strokeWidth={2.5} />
                </View>

                {!!isActive ? (
                    <LiveBadge />
                ) : (
                    <View style={styles.eventEndedBadge}>
                        <Text style={styles.eventEndedText}>ENDED</Text>
                    </View>
                )}

                <View style={[styles.eventDot, { backgroundColor: glowColor }]} />
            </View>
        </Pressable>
    );
}

// ─── Cluster bubble ───────────────────────────────────────────────────────────

function ClusterBubble({ count, color, onPress }: { count: number; color: string; onPress: () => void }) {
    const size = count > 20 ? 56 : count > 10 ? 48 : 40;
    const fontSize = count > 99 ? 11 : count > 9 ? 13 : 14;

    return (
        <Pressable onPress={onPress}>
            <View style={[styles.cluster, { width: size, height: size, borderRadius: size / 2 }]}>
                <View style={[styles.clusterInner, { borderRadius: size / 2, borderColor: color }]}>
                    <Text style={[styles.clusterText, { fontSize }]}>{count > 99 ? '99+' : count}</Text>
                </View>
            </View>
        </Pressable>
    );
}

function RadarLoader() {
    const pulse1 = useSharedValue(0);
    const pulse2 = useSharedValue(0);
    const pulse3 = useSharedValue(0);

    const opacity1 = useSharedValue(0.7);
    const opacity2 = useSharedValue(0.7);
    const opacity3 = useSharedValue(0.7);

    const pinScale = useSharedValue(1);

    useEffect(() => {
        pulse1.value = withRepeat(
            withTiming(1, { duration: 2800, easing: Easing.out(Easing.quad) }),
            -1,
            false
        );
        opacity1.value = withRepeat(
            withTiming(0, { duration: 2800, easing: Easing.out(Easing.quad) }),
            -1,
            false
        );

        pulse2.value = withDelay(
            900,
            withRepeat(
                withTiming(1, { duration: 2800, easing: Easing.out(Easing.quad) }),
                -1,
                false
            )
        );
        opacity2.value = withDelay(
            900,
            withRepeat(
                withTiming(0, { duration: 2800, easing: Easing.out(Easing.quad) }),
                -1,
                false
            )
        );

        pulse3.value = withDelay(
            1800,
            withRepeat(
                withTiming(1, { duration: 2800, easing: Easing.out(Easing.quad) }),
                -1,
                false
            )
        );
        opacity3.value = withDelay(
            1800,
            withRepeat(
                withTiming(0, { duration: 2800, easing: Easing.out(Easing.quad) }),
                -1,
                false
            )
        );

        pinScale.value = withRepeat(
            withSequence(
                withTiming(1.15, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
                withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
    }, []);

    const waveStyle1 = useAnimatedStyle(() => ({
        transform: [{ scale: pulse1.value * 2.8 + 0.2 }],
        opacity: opacity1.value,
    }));

    const waveStyle2 = useAnimatedStyle(() => ({
        transform: [{ scale: pulse2.value * 2.8 + 0.2 }],
        opacity: opacity2.value,
    }));

    const waveStyle3 = useAnimatedStyle(() => ({
        transform: [{ scale: pulse3.value * 2.8 + 0.2 }],
        opacity: opacity3.value,
    }));

    const pinStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pinScale.value }],
    }));

    return (
        <View style={styles.loader}>
            <View style={styles.radarWrapper}>
                {/* Scope grid lines */}
                <View style={styles.radarCrosshairH} />
                <View style={styles.radarCrosshairV} />

                <Animated.View style={[styles.radarWave, waveStyle1]} />
                <Animated.View style={[styles.radarWave, waveStyle2]} />
                <Animated.View style={[styles.radarWave, waveStyle3]} />

                <RadarSweep />

                <View style={styles.loaderGlow} />

                <Animated.View style={[styles.centerPin, pinStyle]}>
                    <MapPin color="#BCBBFD" size={26} strokeWidth={2} />
                </Animated.View>
            </View>

            <Text style={styles.loaderTitle}>VibeMap</Text>
            <Text style={styles.loaderSub}>Mapping the world's energy…</Text>
        </View>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MapScreen() {
    const router = useRouter();
    const [showMap, setShowMap] = useState(false);
    const [userCoords, setUserCoords] = useState<[number, number]>([24.03, 49.84]);
    const [nfts, setNfts] = useState<VibemapNftItem[]>([]);
    const [events, setEvents] = useState<VibemapEventItem[]>([]);
    const [isNftsLoading, setIsNftsLoading] = useState(false);
    const [isEventsLoading, setIsEventsLoading] = useState(false);
    const [currentZoom, setCurrentZoom] = useState(3.5);

    const [filterMode, setFilterMode] = useState<FilterMode>('posts');
    const [mapStyle, setMapStyle] = useState<MapStyle>('dark');
    const [showLegend, setShowLegend] = useState(true);

    const insets = useSafeAreaInsets();
    const eventSheetRef = useRef<EventDetailSheetRef>(null);
    const cameraRef = useRef<MapboxGL.Camera>(null);

    // ── Location ─────────────────────────────────────────────────────────────

    const getUserLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;
            const data = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
            if (data.coords) {
                setUserCoords([data.coords.longitude, data.coords.latitude]);
            }
        } catch (error) {
            console.error('Location error:', error);
        }
    };

    useEffect(() => { getUserLocation(); }, []);

    // ── Data loading ──────────────────────────────────────────────────────────

    const loadNfts = useCallback(async () => {
        setIsNftsLoading(true);
        try { setNfts(await getVibemapNfts()); }
        catch { setNfts([]); }
        finally { setIsNftsLoading(false); }
    }, []);

    const loadEvents = useCallback(async () => {
        setIsEventsLoading(true);
        try { setEvents(await getVibemapEvents()); }
        catch { setEvents([]); }
        finally { setIsEventsLoading(false); }
    }, []);

    useFocusEffect(
        useCallback(() => {
            const timer = setTimeout(() => setShowMap(true), 450);
            loadNfts();
            loadEvents();
            return () => { setShowMap(false); clearTimeout(timer); };
        }, [loadNfts, loadEvents])
    );

    const handlePostPress = useCallback((postId: number) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push({
            pathname: "/post-details",
            params: {
                id: postId,
            }
        });
    }, [router]);

    // ── Derived data ──────────────────────────────────────────────────────────

    const showPosts  = filterMode === 'posts';
    const showEvents = filterMode === 'events';
    const isDarkMap  = mapStyle === 'dark';
    const isLoading  = isNftsLoading || isEventsLoading;

    const mapNfts = useMemo(
        () => nfts.filter(x => typeof x.lat === 'number' && typeof x.lng === 'number'),
        [nfts]
    );
    const mapEvents = useMemo(
        () => events.filter(x => typeof x.lat === 'number' && typeof x.lng === 'number'),
        [events]
    );

    // ── GeoJSON for halo layers ───────────────────────────────────────────────

    const nftsGeoJson = useMemo(() => {
        if (!showPosts) return EMPTY_GEOJSON;
        return {
            type: 'FeatureCollection' as const,
            features: mapNfts.map(item => ({
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [item.lng as number, item.lat as number] },
                properties: { post_id: item.post_id, is_nft: item.is_nft },
            })),
        };
    }, [mapNfts, showPosts]);

    const eventsGeoJson = useMemo(() => {
        if (!showEvents) return EMPTY_GEOJSON;
        return {
            type: 'FeatureCollection' as const,
            features: mapEvents.map(item => ({
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [item.lng, item.lat] },
                properties: { post_id: item.post_id, is_active: item.is_active },
            })),
        };
    }, [mapEvents, showEvents]);

    // ── Simple client-side clustering ─────────────────────────────────────────

    const nftClusters = useMemo(() => {
        if (!showPosts || currentZoom > CLUSTER_MAX_ZOOM) return { clusters: [], singles: mapNfts };
        if (currentZoom > 8) return { clusters: [], singles: mapNfts };

        const gridSize = currentZoom < 4 ? 15 : currentZoom < 6 ? 6 : 2;
        const buckets: Record<string, VibemapNftItem[]> = {};

        for (const item of mapNfts) {
            const key = `${Math.floor((item.lat as number) / gridSize)}_${Math.floor((item.lng as number) / gridSize)}`;
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(item);
        }

        const clusters: { lat: number; lng: number; count: number; key: string }[] = [];
        const singles: VibemapNftItem[] = [];

        for (const [key, items] of Object.entries(buckets)) {
            if (items.length === 1) {
                singles.push(items[0]);
            } else {
                const lat = items.reduce((s, i) => s + (i.lat as number), 0) / items.length;
                const lng = items.reduce((s, i) => s + (i.lng as number), 0) / items.length;
                clusters.push({ lat, lng, count: items.length, key });
            }
        }
        return { clusters, singles };
    }, [mapNfts, showPosts, currentZoom]);

    const eventClusters = useMemo(() => {
        if (!showEvents || currentZoom > CLUSTER_MAX_ZOOM) return { clusters: [], singles: mapEvents };
        if (currentZoom > 8) return { clusters: [], singles: mapEvents };

        const gridSize = currentZoom < 4 ? 15 : currentZoom < 6 ? 6 : 2;
        const buckets: Record<string, VibemapEventItem[]> = {};

        for (const item of mapEvents) {
            const key = `${Math.floor(item.lat / gridSize)}_${Math.floor(item.lng / gridSize)}`;
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(item);
        }

        const clusters: { lat: number; lng: number; count: number; key: string; hasActive: boolean }[] = [];
        const singles: VibemapEventItem[] = [];

        for (const [key, items] of Object.entries(buckets)) {
            if (items.length === 1) {
                singles.push(items[0]);
            } else {
                const lat = items.reduce((s, i) => s + i.lat, 0) / items.length;
                const lng = items.reduce((s, i) => s + i.lng, 0) / items.length;
                clusters.push({ lat, lng, count: items.length, key, hasActive: items.some(i => i.is_active) });
            }
        }
        return { clusters, singles };
    }, [mapEvents, showEvents, currentZoom]);

    // ── Interaction handlers ──────────────────────────────────────────────────

    const handleFilterChange = (mode: FilterMode) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setFilterMode(mode);
    };

    const handleMapStyleChange = (style: MapStyle) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setMapStyle(style);
    };

    const handleClusterPress = useCallback((lat: number, lng: number) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        cameraRef.current?.flyTo([lng, lat], 1200);
    }, []);

    const handleMyLocationPress = async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        getUserLocation();
        cameraRef.current?.flyTo(userCoords, 1000);
    };

    const handleResetCameraPress = async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        cameraRef.current?.setCamera({
            heading: 0,
            pitch: isDarkMap ? 45 : 55,
            zoomLevel: isDarkMap ? 5 : 14,
            animationDuration: 1000,
            animationMode: 'flyTo',
        });
    };

    const handleToggleLegendPress = async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setShowLegend(prev => !prev);
    };

    // ── Legend Animation Styles ──────────────────────────────────────────────

    const legendOpacity = useSharedValue(1);
    const legendTranslateY = useSharedValue(0);

    useEffect(() => {
        legendOpacity.value = withTiming(showLegend ? 1 : 0, { duration: 250 });
        legendTranslateY.value = withSpring(showLegend ? 0 : 25, { damping: 14 });
    }, [showLegend]);

    const legendAnimatedStyle = useAnimatedStyle(() => ({
        opacity: legendOpacity.value,
        transform: [{ translateY: legendTranslateY.value }],
    }));

    // Outdoors = full terrain relief, hill shading, contours, trails — perfect for navigation
    const currentStyleURL = isDarkMap
        ? MapboxGL.StyleURL.Dark
        : 'mapbox://styles/mapbox/outdoors-v12';

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <View style={styles.container}>
            {/* Always black status bar */}
            <StatusBar style="light" backgroundColor="#000000" translucent={false} />

            {showMap ? (
                <>
                    <MapboxGL.MapView
                        style={styles.map}
                        styleURL={currentStyleURL}
                        projection={isDarkMap ? 'globe' : 'mercator'}
                        logoEnabled={false}
                        attributionEnabled={false}
                        scaleBarEnabled={false}
                        onCameraChanged={state => {
                            setCurrentZoom(state.properties.zoom);
                        }}
                    >
                        <MapboxGL.Camera
                            ref={cameraRef}
                            defaultSettings={{ centerCoordinate: [0, 0], zoomLevel: 1 }}
                            centerCoordinate={userCoords}
                            zoomLevel={isDarkMap ? 3.5 : 14}
                            pitch={isDarkMap ? 45 : 55}
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
                                    starIntensity: 1.0,
                                }}
                            />
                        )}

                        {/* ── Real 3D terrain elevation (outdoor mode only) ── */}
                        {!isDarkMap && (
                            <>
                                <MapboxGL.RasterDemSource
                                    id="mapbox-dem"
                                    url="mapbox://mapbox.mapbox-terrain-dem-v1"
                                    tileSize={512}
                                    maxZoomLevel={14}
                                />
                                <MapboxGL.Terrain
                                    sourceID="mapbox-dem"
                                    exaggeration={1.5}
                                />
                                <MapboxGL.SkyLayer
                                    id="sky"
                                    style={{
                                        skyType: 'atmosphere',
                                        skyAtmosphereSun: [0, 90],
                                        skyAtmosphereSunIntensity: 15,
                                    }}
                                />
                            </>
                        )}

                        {/* ── NFT halo layer ── */}
                        <MapboxGL.ShapeSource id="vibemap-nfts" shape={nftsGeoJson}>
                            <MapboxGL.CircleLayer
                                id="vibemap-nfts-halo"
                                style={{
                                    circleColor: ['case', ['==', ['get', 'is_nft'], true], '#BCBBFD', 'rgba(255, 255, 255, 0.4)'],
                                    circleOpacity: ['interpolate', ['linear'], ['zoom'], 0, 0.5, 4, 0.3, 8, 0.1, 12, 0.0],
                                    circleRadius: ['case', ['==', ['get', 'is_nft'], true], ['interpolate', ['linear'], ['zoom'], 0, 24, 4, 14, 8, 7, 12, 3.5], ['interpolate', ['linear'], ['zoom'], 0, 18, 4, 10, 8, 5, 12, 2.5]],
                                    circleBlur: 1.2,
                                    circleStrokeWidth: 1,
                                    circleStrokeColor: ['case', ['==', ['get', 'is_nft'], true], 'rgba(82,5,159,0.85)', 'rgba(120, 120, 120, 0.4)'],
                                    circleStrokeOpacity: ['interpolate', ['linear'], ['zoom'], 0, 0.7, 8, 0.2, 12, 0.0],
                                }}
                            />
                        </MapboxGL.ShapeSource>

                        {/* ── Event halo layer ── */}
                        <MapboxGL.ShapeSource id="vibemap-events-halo-source" shape={eventsGeoJson}>
                            <MapboxGL.CircleLayer
                                id="vibemap-events-halo"
                                style={{
                                    circleColor: ['case', ['==', ['get', 'is_active'], true], '#05f0d8', '#f87171'],
                                    circleOpacity: ['interpolate', ['linear'], ['zoom'], 0, 0.55, 4, 0.35, 8, 0.15, 12, 0.0],
                                    circleRadius: ['interpolate', ['linear'], ['zoom'], 0, 24, 4, 16, 8, 8, 12, 4],
                                    circleBlur: 1.4,
                                    circleStrokeWidth: 1.5,
                                    circleStrokeColor: ['case', ['==', ['get', 'is_active'], true], 'rgba(5,240,216,0.8)', 'rgba(248,113,113,0.55)'],
                                    circleStrokeOpacity: ['interpolate', ['linear'], ['zoom'], 0, 0.75, 8, 0.3, 12, 0.0],
                                }}
                            />
                        </MapboxGL.ShapeSource>

                        {/* ── Border layers (dark mode) ── */}
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

                        {/* ── User pulsating beacon ── */}
                        <MapboxGL.MarkerView
                            key="user-location-beacon"
                            coordinate={userCoords}
                            anchor={{ x: 0.5, y: 0.5 }}
                        >
                            <UserLocationBeacon />
                        </MapboxGL.MarkerView>

                        {/* ── NFT clusters ── */}
                        {showPosts && nftClusters.clusters.map(cluster => (
                            <MapboxGL.MarkerView
                                key={`nft-cluster-${cluster.key}`}
                                coordinate={[cluster.lng, cluster.lat]}
                                anchor={{ x: 0.5, y: 0.5 }}
                            >
                                <ClusterBubble
                                    count={cluster.count}
                                    color="rgba(168,85,247,0.8)"
                                    onPress={() => handleClusterPress(cluster.lat, cluster.lng)}
                                />
                            </MapboxGL.MarkerView>
                        ))}

                        {/* ── Post single markers ── */}
                        {showPosts && nftClusters.singles.map(item => (
                            <MapboxGL.MarkerView
                                key={`post-${item.post_id}`}
                                coordinate={[item.lng as number, item.lat as number]}
                                anchor={{ x: 0.5, y: 0.5 }}
                                allowOverlap={false}
                            >
                                {item.is_nft ? (
                                    <NftMarker item={item} onPress={() => handlePostPress(item.post_id)} />
                                ) : (
                                    <PostMarker item={item} onPress={() => handlePostPress(item.post_id)} />
                                )}
                            </MapboxGL.MarkerView>
                        ))}

                        {/* ── Event clusters ── */}
                        {showEvents && eventClusters.clusters.map(cluster => (
                            <MapboxGL.MarkerView
                                key={`event-cluster-${cluster.key}`}
                                coordinate={[cluster.lng, cluster.lat]}
                                anchor={{ x: 0.5, y: 0.5 }}
                            >
                                <ClusterBubble
                                    count={cluster.count}
                                    color={cluster.hasActive ? 'rgba(5,240,216,0.8)' : 'rgba(248,113,113,0.7)'}
                                    onPress={() => handleClusterPress(cluster.lat, cluster.lng)}
                                />
                            </MapboxGL.MarkerView>
                        ))}

                        {/* ── Event single markers ── */}
                        {showEvents && eventClusters.singles.map(item => (
                            <MapboxGL.MarkerView
                                key={`event-${item.post_id}`}
                                coordinate={[item.lng, item.lat]}
                                anchor={{ x: 0.5, y: 0.5 }}
                                allowOverlap={false}
                            >
                                <EventMarker item={item} onPress={() => eventSheetRef.current?.present(item)} />
                            </MapboxGL.MarkerView>
                        ))}
                    </MapboxGL.MapView>

                    {/* ── Top controls — sits below status bar, never under navbar ── */}
                    <View
                        style={[styles.controlsContainer, { top: insets.top + 8 }]}
                        pointerEvents="box-none"
                    >

                        {/* Loading badge */}
                        {isLoading && (
                            <BlurView intensity={30} tint="dark" style={styles.loadingBadge}>
                                <ActivityIndicator size="small" color="#BCBBFD" />
                                <Text style={styles.loadingText}>Syncing vibes…</Text>
                            </BlurView>
                        )}

                        <View style={styles.pillsRow}>
                            {/* Filter pills */}
                            <BlurView intensity={40} tint="dark" style={styles.pillGroup}>
                                <FilterPill
                                    isActive={filterMode === 'posts'}
                                    Icon={Camera}
                                    label="Posts"
                                    onPress={() => handleFilterChange('posts')}
                                    gradientColors={['rgba(168,85,247,0.5)', 'rgba(100,30,180,0.4)']}
                                />
                                <FilterPill
                                    isActive={filterMode === 'events'}
                                    Icon={Calendar}
                                    label="Events"
                                    onPress={() => handleFilterChange('events')}
                                    gradientColors={['rgba(5,240,216,0.4)', 'rgba(0,160,140,0.35)']}
                                />
                            </BlurView>

                            {/* Map style pills */}
                            <BlurView intensity={40} tint="dark" style={styles.pillGroup}>
                                <FilterPill
                                    isActive={mapStyle === 'dark'}
                                    Icon={Moon}
                                    label="Vibe"
                                    onPress={() => handleMapStyleChange('dark')}
                                    gradientColors={['rgba(168,85,247,0.5)', 'rgba(100,30,180,0.4)']}
                                />
                                <FilterPill
                                    isActive={mapStyle === 'street'}
                                    Icon={LucideMap}
                                    label="3D"
                                    onPress={() => handleMapStyleChange('street')}
                                    gradientColors={['rgba(168,85,247,0.5)', 'rgba(100,30,180,0.4)']}
                                />
                            </BlurView>
                        </View>
                    </View>

                    {/* ── Floating HUD Column on the Right ── */}
                    <View style={[styles.hudContainer, { top: insets.top + 80 }]} pointerEvents="box-none">
                        {/* Centering on User Location */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={handleMyLocationPress}
                            style={styles.hudButton}
                        >
                            <BlurView intensity={45} tint="dark" style={styles.hudButtonInner}>
                                <Compass color="#BCBBFD" size={20} strokeWidth={2} />
                            </BlurView>
                        </TouchableOpacity>

                        {/* Reset Camera to North */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={handleResetCameraPress}
                            style={styles.hudButton}
                        >
                            <BlurView intensity={45} tint="dark" style={styles.hudButtonInner}>
                                <LucideMap color="#BCBBFD" size={18} strokeWidth={2} />
                            </BlurView>
                        </TouchableOpacity>

                        {/* Legend Toggle */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={handleToggleLegendPress}
                            style={[styles.hudButton, showLegend && styles.hudButtonActive]}
                        >
                            <BlurView intensity={45} tint="dark" style={styles.hudButtonInner}>
                                <Info color={showLegend ? "#a855f7" : "#BCBBFD"} size={19} strokeWidth={2} />
                            </BlurView>
                        </TouchableOpacity>
                    </View>

                    {/* ── Legend Card ── */}
                    <Animated.View style={[styles.legend, { bottom: insets.bottom + 85 }, legendAnimatedStyle]} pointerEvents={showLegend ? "auto" : "none"}>
                        <BlurView intensity={45} tint="dark" style={styles.legendInner}>
                            <Text style={styles.legendTitle}>Map Legend</Text>
                            <View style={styles.legendRow}>
                                <View style={[styles.legendDot, { backgroundColor: '#a855f7' }]} />
                                <Text style={styles.legendLabel}>NFT Post</Text>
                            </View>
                            <View style={styles.legendRow}>
                                <View style={[styles.legendDot, { backgroundColor: 'rgba(255, 255, 255, 0.6)' }]} />
                                <Text style={styles.legendLabel}>Regular Post</Text>
                            </View>
                            <View style={styles.legendRow}>
                                <View style={[styles.legendDot, { backgroundColor: '#05f0d8' }]} />
                                <Text style={styles.legendLabel}>Live Event</Text>
                            </View>
                            <View style={styles.legendRow}>
                                <View style={[styles.legendDot, { backgroundColor: '#f87171' }]} />
                                <Text style={styles.legendLabel}>Ended Event</Text>
                            </View>
                        </BlurView>
                    </Animated.View>
                </>
            ) : (
                /* ── Loading screen ── */
                <RadarLoader />
            )}

            <EventDetailSheet ref={eventSheetRef} />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    map: { flex: 1 },

    // ── Loading screen ─────────────────────────────────────────────────────
    loader: {
        flex: 1,
        backgroundColor: '#0A0410',
        justifyContent: 'center',
        alignItems: 'center',
    },
    radarWrapper: {
        width: 140,
        height: 140,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    radarWave: {
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 1.5,
        borderColor: 'rgba(188, 187, 253, 0.35)',
        backgroundColor: 'rgba(188, 187, 253, 0.02)',
    },
    centerPin: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#0A0410',
        borderWidth: 1.5,
        borderColor: 'rgba(188, 187, 253, 0.3)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#BCBBFD',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 8,
        zIndex: 2,
    },
    loaderGlow: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(168,85,247,0.12)',
    },
    loaderTitle: {
        color: '#BCBBFD',
        fontSize: 24,
        fontFamily: 'Dank Mono Bold',
        letterSpacing: 8,
        textTransform: 'uppercase',
        marginTop: 8,
    },
    loaderSub: {
        color: 'rgba(188,187,253,0.45)',
        fontSize: 12,
        fontFamily: 'Dank Mono',
        letterSpacing: 1.5,
    },

    // ── Radar loader animations styles ──
    sweepContainer: {
        position: 'absolute',
        width: 140,
        height: 140,
        justifyContent: 'flex-start',
        alignItems: 'center',
    },
    sweepLine: {
        width: 2,
        height: 70,
    },
    radarCrosshairH: {
        position: 'absolute',
        width: 130,
        height: 1,
        backgroundColor: 'rgba(188, 187, 253, 0.12)',
    },
    radarCrosshairV: {
        position: 'absolute',
        width: 1,
        height: 130,
        backgroundColor: 'rgba(188, 187, 253, 0.12)',
    },

    // ── Controls ───────────────────────────────────────────────────────────
    controlsContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        zIndex: 10,
    },
    loadingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        overflow: 'hidden',
        borderWidth: 0.5,
        borderColor: 'rgba(188,187,253,0.2)',
        marginBottom: 4,
    },
    loadingText: {
        color: '#BCBBFD',
        fontSize: 12,
        fontFamily: 'Dank Mono',
        letterSpacing: 0.5,
    },

    pillsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    pillGroup: {
        flexDirection: 'row',
        borderRadius: 14,
        overflow: 'hidden',
        padding: 3,
        borderWidth: 0.5,
        borderColor: 'rgba(168,85,247,0.25)',
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 11,
        overflow: 'hidden',
    },
    pillActive: {
    },
    pillText: {
        color: 'rgba(255,255,255,0.4)',
        fontFamily: 'Dank Mono Bold',
        fontSize: 12,
        includeFontPadding: false,
    },
    pillTextActive: {
        color: '#FFFFFF',
    },

    // ── Floating HUD Buttons ──
    hudContainer: {
        position: 'absolute',
        right: 16,
        alignItems: 'center',
        gap: 10,
        zIndex: 10,
    },
    hudButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        overflow: 'hidden',
        borderWidth: 0.5,
        borderColor: 'rgba(168,85,247,0.25)',
        shadowColor: '#a855f7',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 4,
    },
    hudButtonActive: {
        borderColor: '#a855f7',
        shadowOpacity: 0.35,
        shadowRadius: 10,
    },
    hudButtonInner: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ── Legend ─────────────────────────────────────────────────────────────
    legend: {
        position: 'absolute',
        right: 16,
        zIndex: 10,
    },
    legendInner: {
        borderRadius: 16,
        overflow: 'hidden',
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 8,
        borderWidth: 0.5,
        borderColor: 'rgba(168,85,247,0.25)',
    },
    legendTitle: {
        color: '#BCBBFD',
        fontSize: 10,
        fontFamily: 'Dank Mono Bold',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 4,
        includeFontPadding: false,
    },
    legendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    legendLabel: {
        color: 'rgba(255,255,255,0.65)',
        fontSize: 11,
        fontFamily: 'Dank Mono',
    },

    // ── Cluster ────────────────────────────────────────────────────────────
    cluster: {
        backgroundColor: 'rgba(10,4,22,0.88)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#a855f7',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 5,
    },
    clusterInner: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        borderRadius: 999,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    clusterText: {
        color: '#FFFFFF',
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },

    // ── Shared marker ──────────────────────────────────────────────────────
    markerHitArea: {
        padding: 4,
    },
    nftCard: {
        width: 56,
        height: 78,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: 'rgba(168,85,247,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    nftCardGlow: {
        shadowColor: '#a855f7',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 8,
    },
    nftCardImage: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        borderRadius: 14,
    },
    nftCardFallback: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(168,85,247,0.25)',
    },
    nftCardBorder: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: '#a855f7',
    },
    nftSparkleBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#a855f7',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#0A0410',
        zIndex: 5,
    },
    nftSparkleText: {
        fontSize: 9,
        color: '#fff',
        includeFontPadding: false,
    },
    nftAvatarRing: {
        position: 'absolute',
        bottom: -8,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.8)',
        borderWidth: 2,
        borderColor: '#a855f7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    nftAvatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
    },
    nftAvatarFallback: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(168,85,247,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ── Regular Post marker styles ──────────────────────────────────────────
    postCard: {
        width: 42,
        height: 58,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#ffffff',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 5,
        elevation: 4,
    },
    postCardImage: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        borderRadius: 10,
    },
    postCardFallback: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    postCardBorder: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.25)',
    },
    postAvatarRing: {
        position: 'absolute',
        bottom: -6,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderWidth: 1.5,
        borderColor: '#888888',
        alignItems: 'center',
        justifyContent: 'center',
    },
    postAvatar: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    postAvatarFallback: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ── Event marker ───────────────────────────────────────────────────────
    eventCard: {
        width: 58,
        height: 58,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 2,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    eventCardGlowActive: {
        shadowColor: '#05f0d8',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
        elevation: 8,
    },
    eventCardGlowEnded: {
        shadowColor: '#f87171',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
    },
    eventCardImage: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        borderRadius: 14,
    },
    eventCardFallback: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
    },
    eventBadge: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    eventLiveBadge: {
        position: 'absolute',
        top: 4,
        left: 4,
        backgroundColor: 'rgba(5,240,216,0.95)',
        borderRadius: 4,
        paddingHorizontal: 4,
        paddingVertical: 1.5,
        zIndex: 5,
    },
    eventLiveText: {
        color: '#000',
        fontSize: 7,
        fontFamily: 'Dank Mono Bold',
        letterSpacing: 0.5,
        includeFontPadding: false,
    },
    eventEndedBadge: {
        position: 'absolute',
        top: 4,
        left: 4,
        backgroundColor: 'rgba(248,113,113,0.95)',
        borderRadius: 4,
        paddingHorizontal: 4,
        paddingVertical: 1.5,
        zIndex: 5,
    },
    eventEndedText: {
        color: '#000',
        fontSize: 6,
        fontFamily: 'Dank Mono Bold',
        letterSpacing: 0.5,
        includeFontPadding: false,
    },
    eventDot: {
        position: 'absolute',
        top: -3,
        right: -3,
        width: 11,
        height: 11,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#000',
    },

    // ── User location pulse ──
    userBeaconContainer: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    userBeaconPulse: {
        position: 'absolute',
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(168, 85, 247, 0.35)',
        borderWidth: 1.5,
        borderColor: 'rgba(168, 85, 247, 0.7)',
    },
    userBeaconCenter: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#a855f7',
        borderWidth: 2,
        borderColor: '#ffffff',
        shadowColor: '#a855f7',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 5,
        elevation: 6,
    },
});