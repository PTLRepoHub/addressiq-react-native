import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { AddressIQTheme } from '../../types';

/**
 * Draggable-pin map for the address stage. `react-native-maps` (Google
 * provider) is an OPTIONAL peer dependency — we resolve it lazily so the SDK
 * doesn't hard-crash when a bare-RN partner hasn't installed it. When the
 * module (or a Maps API key) is missing, the caller falls back to the GPS +
 * manual-entry path; this component renders a coordinate placeholder.
 */

// Minimal local typing so this file type-checks WITHOUT react-native-maps in
// devDependencies (avoids forcing the native pod on this repo's CI).
type LatLng = { latitude: number; longitude: number };
interface MapsModule {
  default: React.ComponentType<Record<string, unknown>>;
  Marker: React.ComponentType<Record<string, unknown>>;
  PROVIDER_GOOGLE?: unknown;
}

let maps: MapsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  maps = require('react-native-maps') as MapsModule;
} catch {
  maps = null;
}

export const isMapAvailable = (): boolean => maps !== null;

interface Props {
  theme: AddressIQTheme;
  lat: number;
  lon: number;
  /** Fired when the user drags the pin to a new point. */
  onPinMove: (lat: number, lon: number) => void;
}

export default function AddressMap({ theme, lat, lon, onPinMove }: Props) {
  if (!maps) {
    return (
      <View style={[styles.fallback, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.fallbackText, { color: theme.textSecondary }]}>
          {lat.toFixed(6)}, {lon.toFixed(6)}
        </Text>
        <Text style={[styles.fallbackHint, { color: theme.textSecondary }]}>
          Install react-native-maps for the interactive map.
        </Text>
      </View>
    );
  }

  const MapView = maps.default;
  const Marker = maps.Marker;
  const region = { latitude: lat, longitude: lon, latitudeDelta: 0.003, longitudeDelta: 0.003 };

  return (
    <View style={[styles.mapWrap, { borderColor: theme.border }]}>
      <MapView
        style={styles.map}
        provider={maps.PROVIDER_GOOGLE}
        region={region}
        onPress={(e: { nativeEvent: { coordinate: LatLng } }) =>
          onPinMove(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)
        }
      >
        <Marker
          draggable
          coordinate={{ latitude: lat, longitude: lon }}
          onDragEnd={(e: { nativeEvent: { coordinate: LatLng } }) =>
            onPinMove(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)
          }
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { height: 220, borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 14 },
  map: { ...StyleSheet.absoluteFillObject },
  fallback: { height: 120, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 16, marginBottom: 14 },
  fallbackText: { fontSize: 15, fontWeight: '700', fontFamily: 'monospace' },
  fallbackHint: { fontSize: 12, marginTop: 6, textAlign: 'center' },
});
