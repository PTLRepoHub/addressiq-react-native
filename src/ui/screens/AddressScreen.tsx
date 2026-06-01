import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import type { AddressIQTheme, AddressData, LocationReading } from '../../types';
import ScreenWrapper from '../components/ScreenWrapper';
import Button from '../components/Button';
import Icon from '../components/Icon';

/**
 * Address capture screen for the core (bare-RN) SDK.
 *
 * Simpler than the Expo widget's AddressScreen — no Google Places
 * autocomplete / MapView / Mapbox by default, because those would force
 * extra native dependencies on partners. Partners on bare RN typically
 * already have their own address pickers; this screen handles the
 * minimum: get a current GPS fix + let the user enter / confirm a
 * formatted address string.
 *
 * If a partner wants the full themed autocomplete experience, they can
 * pass a richer `initialAddress` (with `formattedAddress`, `placeId`,
 * `lat`, `lon`) computed by their own UI and the screen surfaces a
 * "Use this address" path.
 */
interface Props {
  theme: AddressIQTheme;
  initialAddress?: Partial<AddressData>;
  /** Provided by `<IQLocationManager>` — wraps the SDK's `getCurrentLocation`. */
  getCurrentLocation: () => Promise<LocationReading>;
  onNext: (address: Partial<AddressData>) => void;
  onCancel: () => void;
}

export default function AddressScreen({ theme, initialAddress, getCurrentLocation, onNext, onCancel }: Props) {
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number; accuracyM: number } | null>(
    initialAddress?.lat != null && initialAddress?.lon != null
      ? { lat: initialAddress.lat, lon: initialAddress.lon, accuracyM: 0 }
      : null,
  );
  const [formatted, setFormatted] = useState<string>(initialAddress?.formattedAddress ?? '');

  useEffect(() => {
    if (!coords) {
      void captureLocation();
    }
  }, []);

  async function captureLocation() {
    setLoading(true);
    try {
      const reading = await getCurrentLocation();
      setCoords({ lat: reading.lat, lon: reading.lon, accuracyM: reading.accuracyM });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read location.';
      Alert.alert('Location error', message);
    } finally {
      setLoading(false);
    }
  }

  const canContinue = !!coords && formatted.trim().length > 0;

  return (
    <ScreenWrapper
      theme={theme}
      title="Confirm your address"
      subtitle="We'll use your current location and the address you enter to verify where you live."
      step={0}
      totalSteps={3}
      onClose={onCancel}
      footer={
        <Button
          title="Continue"
          onPress={() =>
            coords &&
            onNext({
              ...initialAddress,
              lat: coords.lat,
              lon: coords.lon,
              formattedAddress: formatted.trim(),
            })
          }
          theme={theme}
          disabled={!canContinue}
        />
      }
    >
      <View style={[styles.gpsCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <View style={styles.gpsHeader}>
          <Icon name="navigate" size={18} color={theme.primary} />
          <Text style={[styles.gpsLabel, { color: theme.textSecondary }]}>CURRENT LOCATION</Text>
        </View>
        {loading ? (
          <View style={styles.gpsLoading}>
            <ActivityIndicator color={theme.primary} />
            <Text style={[styles.gpsLoadingText, { color: theme.textSecondary }]}>Reading GPS…</Text>
          </View>
        ) : coords ? (
          <View>
            <Text style={[styles.gpsCoords, { color: theme.text }]}>
              {coords.lat.toFixed(6)}, {coords.lon.toFixed(6)}
            </Text>
            {coords.accuracyM > 0 && (
              <Text style={[styles.gpsAccuracy, { color: theme.textSecondary }]}>
                ±{Math.round(coords.accuracyM)} m accuracy
              </Text>
            )}
            <TouchableOpacity onPress={captureLocation} style={styles.refreshBtn}>
              <Icon name="refresh" size={14} color={theme.primary} />
              <Text style={[styles.refreshText, { color: theme.primary }]}>Read again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Button title="Read location" onPress={captureLocation} theme={theme} variant="outline" />
        )}
      </View>

      <Text style={[styles.label, { color: theme.text }]}>Formatted address</Text>
      <TextInput
        style={[styles.input, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]}
        value={formatted}
        onChangeText={setFormatted}
        placeholder="e.g. 1 Marina, Lagos Island, Lagos"
        placeholderTextColor={theme.textSecondary}
        multiline
        numberOfLines={2}
        textAlignVertical="top"
      />
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Enter your address exactly as it should appear on official records. The next screen captures property details.
      </Text>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  gpsCard: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 18 },
  gpsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  gpsLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  gpsLoading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gpsLoadingText: { fontSize: 13 },
  gpsCoords: { fontSize: 16, fontWeight: '700', fontFamily: 'monospace', marginBottom: 4 },
  gpsAccuracy: { fontSize: 12 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  refreshText: { fontSize: 13, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, minHeight: 60, paddingTop: 13, marginBottom: 10 },
  hint: { fontSize: 12, lineHeight: 18 },
});
