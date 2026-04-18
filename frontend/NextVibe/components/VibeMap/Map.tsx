import React, { useState, useCallback, useEffect } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
export default function MapScreen() {
    const [showMap, setShowMap] = useState(false);
    const [userCoords, setUserCoords] = useState<[number, number]>([24.03, 49.84]);

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

    useFocusEffect(
        useCallback(() => {
            const timer = setTimeout(() => {
                setShowMap(true);
            }, 450);

            return () => {
                setShowMap(false);
                clearTimeout(timer);
            };
        }, [])
    );

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
});