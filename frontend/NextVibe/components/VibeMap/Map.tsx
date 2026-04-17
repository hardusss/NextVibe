import React, { useState, useCallback } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { useFocusEffect } from 'expo-router';

export default function MapScreen() {
  const [showMap, setShowMap] = useState(false);

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
      {showMap ? (
        <MapboxGL.MapView 
          style={styles.map} 
          styleURL={MapboxGL.StyleURL.Dark}
          logoEnabled={false} 
          attributionEnabled={false}
          surfaceView={false} 
          projection='globe'
        >
          <MapboxGL.Camera
            defaultSettings={{
              centerCoordinate: [0, 0], 
              zoomLevel: 1.5,
            }}
          />
        </MapboxGL.MapView>
      ) : (
        <View style={styles.loader}>
          <Text style={styles.loaderText}>Start VibeMap...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0A0410' 
  },
  loader: { 
    flex: 1,
    backgroundColor: '#0A0410', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  loaderText: {
    color: '#BCBBFD', 
    fontSize: 14,
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  map: { flex: 1 },
});