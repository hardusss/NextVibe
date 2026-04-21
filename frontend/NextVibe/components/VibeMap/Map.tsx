import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Image, Pressable } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { getVibemapNfts, VibemapNftItem } from '@/src/api/get.vibemap.nfts';
export default function MapScreen() {
    const [showMap, setShowMap] = useState(false);
    const [userCoords, setUserCoords] = useState<[number, number]>([24.03, 49.84]);
    const [nfts, setNfts] = useState<VibemapNftItem[]>([]);
    const [isNftsLoading, setIsNftsLoading] = useState(false);

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

    useFocusEffect(
        useCallback(() => {
            const timer = setTimeout(() => {
                setShowMap(true);
            }, 450);

            loadNfts();

            return () => {
                setShowMap(false);
                clearTimeout(timer);
            };
        }, [loadNfts])
    );

    const mapNfts = useMemo(() => {
        return nfts.filter((x) => typeof x.lat === "number" && typeof x.lng === "number");
    }, [nfts]);

    return (
        <View style={styles.container}>
            <StatusBar translucent backgroundColor='#000000'/>
            {showMap ? (
                <MapboxGL.MapView
                    style={styles.map}
                    styleURL={MapboxGL.StyleURL.Dark}
                    projection="globe"
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
                        zoomLevel={3.5}
                        pitch={45}
                        animationDuration={3500}
                        animationMode="flyTo"
                    />

                    <MapboxGL.Atmosphere
                        style={{
                            color: '#000000',
                            highColor: '#52059f',
                            spaceColor: '#000000',
                            horizonBlend: 0.02,
                            starIntensity: 1.0
                        }}
                    />

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

                    {mapNfts.map((item) => (
                        <MapboxGL.PointAnnotation
                            key={String(item.post_id)}
                            id={`vibemap-nft-${item.post_id}`}
                            coordinate={[item.lng as number, item.lat as number]}
                        >
                            <Pressable style={styles.markerContainer}>
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
                            </Pressable>
                        </MapboxGL.PointAnnotation>
                    ))}

                    {isNftsLoading ? (
                        <View style={styles.mapLoadingBadge}>
                            <ActivityIndicator size="small" color="#BCBBFD" />
                            <Text style={styles.mapLoadingText}>Loading drops…</Text>
                        </View>
                    ) : null}
                </MapboxGL.MapView>
            ) : (
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color="#BCBBFD" />
                    <Text style={styles.loaderText}>Mapping the VibeWorld...</Text>
                </View>
            )}
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
        borderColor: "rgba(188, 187, 253, 0.75)",
        alignItems: "center",
        justifyContent: "center",
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
});