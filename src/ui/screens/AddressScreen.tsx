import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import type { AddressIQTheme, AddressData, LocationReading } from '../../types';
import ScreenWrapper from '../components/ScreenWrapper';
import Button from '../components/Button';
import Icon from '../components/Icon';
import AddressMap from '../components/AddressMap';
import {
  placesAutocomplete,
  placeDetails,
  reverseGeocode,
  streetViewCoverage,
  resolveGoogleMapsKey,
  type PlaceSuggestion,
} from '../../maps';

/**
 * §6.6 step 5 — address capture for the Collect UI.
 *
 * Map flow (when a Google Maps key is configured): current location / Places
 * Autocomplete → draggable map pin → auto-derived formatted address (read-only).
 * On Continue, checks Street View coverage: when available it routes to the
 * dedicated `streetview` stage (§6.6 step 6) via `onStreetView`; otherwise it
 * advances straight to property details via `onNext`. Falls back to GPS + a
 * manual formatted-address field when no key is available.
 */
interface Props {
  theme: AddressIQTheme;
  initialAddress?: Partial<AddressData>;
  /** Provided by `<IQLocationManager>` — wraps the SDK's `getCurrentLocation`. */
  getCurrentLocation: () => Promise<LocationReading>;
  /** Google Maps API key (prop wins over SDK config). */
  googleMapsApiKey?: string;
  /** Advance to property details (no Street View coverage / no key). */
  onNext: (address: Partial<AddressData>) => void;
  /** Route to the Street View stage (§6.6 step 6) when coverage exists. */
  onStreetView: (address: Partial<AddressData>) => void;
  onCancel: () => void;
}

export default function AddressScreen({
  theme,
  initialAddress,
  getCurrentLocation,
  googleMapsApiKey,
  onNext,
  onStreetView,
  onCancel,
}: Props) {
  const mapsKey = resolveGoogleMapsKey(googleMapsApiKey);
  const sessionToken = useRef(`pa_${Math.abs(hashString(String(initialAddress?.placeId ?? Date.now())))}`).current;
  const reqId = useRef(0);

  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    initialAddress?.lat != null && initialAddress?.lon != null
      ? { lat: initialAddress.lat, lon: initialAddress.lon }
      : null,
  );
  const [formatted, setFormatted] = useState<string>(initialAddress?.formattedAddress ?? '');
  const [placeId, setPlaceId] = useState<string | undefined>(initialAddress?.placeId);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [resolvingAddr, setResolvingAddr] = useState(false);

  const [checkingCoverage, setCheckingCoverage] = useState(false);

  useEffect(() => {
    if (!coords) void captureLocation();
  }, []);

  async function captureLocation() {
    setLoading(true);
    try {
      const reading = await getCurrentLocation();
      await applyPoint(reading.lat, reading.lon);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read location.';
      Alert.alert('Location error', message);
    } finally {
      setLoading(false);
    }
  }

  /** Set the point and auto-derive the formatted address (reverse geocode). */
  async function applyPoint(lat: number, lon: number, knownAddress?: string, knownPlaceId?: string) {
    setCoords({ lat, lon });
    setPlaceId(knownPlaceId);
    if (knownAddress) {
      setFormatted(knownAddress);
      return;
    }
    if (!mapsKey) return; // manual-entry fallback keeps the typed value
    setResolvingAddr(true);
    try {
      const addr = await reverseGeocode(lat, lon, mapsKey);
      if (addr) setFormatted(addr);
    } finally {
      setResolvingAddr(false);
    }
  }

  async function onSearchChange(text: string) {
    setQuery(text);
    if (!mapsKey || text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const id = ++reqId.current;
    const out = await placesAutocomplete(text, mapsKey, sessionToken);
    if (id === reqId.current) setSuggestions(out);
  }

  async function pickSuggestion(s: PlaceSuggestion) {
    setQuery('');
    setSuggestions([]);
    setResolvingAddr(true);
    try {
      const place = await placeDetails(s.placeId, mapsKey!, sessionToken);
      if (place) {
        await applyPoint(place.lat, place.lon, place.formattedAddress, s.placeId);
      }
    } finally {
      setResolvingAddr(false);
    }
  }

  /** Address patch (no Street View fields — those are added by the next stage). */
  function buildPatch(): Partial<AddressData> {
    return {
      ...initialAddress,
      lat: coords?.lat,
      lon: coords?.lon,
      formattedAddress: formatted.trim(),
      placeId,
    };
  }

  async function onContinue() {
    if (!coords) return;
    // §6.6 step 6 is coverage-gated: route to the Street View stage when a
    // panorama exists near the point, otherwise advance straight to details.
    if (mapsKey) {
      setCheckingCoverage(true);
      try {
        const cov = await streetViewCoverage(coords.lat, coords.lon, mapsKey);
        if (cov.available) {
          onStreetView(buildPatch());
          return;
        }
      } finally {
        setCheckingCoverage(false);
      }
    }
    onNext(buildPatch());
  }

  const canContinue = !!coords && formatted.trim().length > 0;

  return (
    <ScreenWrapper
      theme={theme}
      title="Confirm your address"
      subtitle="Search for your address or drop a pin on the map. We'll use this to verify where you live."
      onClose={onCancel}
      footer={
        <Button
          title={checkingCoverage ? 'Checking…' : 'Continue'}
          onPress={onContinue}
          theme={theme}
          disabled={!canContinue || checkingCoverage}
        />
      }
    >
      {mapsKey ? (
        <View style={styles.searchBlock}>
          <View style={[styles.searchBar, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Icon name="navigate" size={16} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              value={query}
              onChangeText={onSearchChange}
              placeholder="Search your address"
              placeholderTextColor={theme.textSecondary}
            />
          </View>
          {suggestions.length > 0 && (
            <View style={[styles.suggestions, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              {suggestions.map((s) => (
                <TouchableOpacity key={s.placeId} style={styles.suggestion} onPress={() => pickSuggestion(s)}>
                  <Text style={[styles.suggestionMain, { color: theme.text }]} numberOfLines={1}>
                    {s.primaryText}
                  </Text>
                  {s.secondaryText ? (
                    <Text style={[styles.suggestionSub, { color: theme.textSecondary }]} numberOfLines={1}>
                      {s.secondaryText}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {loading ? (
        <View style={[styles.mapLoading, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <ActivityIndicator color={theme.primary} />
          <Text style={[styles.mapLoadingText, { color: theme.textSecondary }]}>Reading GPS…</Text>
        </View>
      ) : coords ? (
        <AddressMap theme={theme} lat={coords.lat} lon={coords.lon} onPinMove={(lat, lon) => void applyPoint(lat, lon)} />
      ) : null}

      <TouchableOpacity onPress={captureLocation} style={styles.useLocation}>
        <Icon name="navigate" size={14} color={theme.primary} />
        <Text style={[styles.useLocationText, { color: theme.primary }]}>Use my current location</Text>
      </TouchableOpacity>

      <Text style={[styles.label, { color: theme.text }]}>Formatted address</Text>
      {mapsKey ? (
        <View style={[styles.readonly, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}>
          {resolvingAddr ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <Text style={[styles.readonlyText, { color: theme.text }]}>
              {formatted || 'Move the pin or search to set your address.'}
            </Text>
          )}
        </View>
      ) : (
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
      )}
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        The next screen captures property details (house number, building color, directions).
      </Text>
    </ScreenWrapper>
  );
}

/** Stable, dependency-free hash for the Places session token seed. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

const styles = StyleSheet.create({
  searchBlock: { marginBottom: 14, zIndex: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, fontSize: 15 },
  suggestions: { borderWidth: 1, borderRadius: 12, marginTop: 6, overflow: 'hidden' },
  suggestion: { paddingHorizontal: 14, paddingVertical: 11 },
  suggestionMain: { fontSize: 14, fontWeight: '600' },
  suggestionSub: { fontSize: 12, marginTop: 2 },
  mapLoading: { height: 120, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 },
  mapLoadingText: { fontSize: 13 },
  useLocation: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  useLocationText: { fontSize: 13, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  readonly: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, minHeight: 52, justifyContent: 'center', marginBottom: 10 },
  readonlyText: { fontSize: 15, lineHeight: 21 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, minHeight: 60, paddingTop: 13, marginBottom: 10 },
  hint: { fontSize: 12, lineHeight: 18 },
});
