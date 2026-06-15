/**
 * Map flow helpers for the Collect UI. Pure-TS Google Maps Platform clients
 * (no native dependency) plus a small key resolver.
 */
export {
  placesAutocomplete,
  placeDetails,
  reverseGeocode,
  streetViewCoverage,
} from './client';
export type { PlaceSuggestion, ResolvedPlace, StreetViewCoverage } from './client';

import { getConfig } from '../config';

/**
 * Resolve the Google Maps API key: an explicit value (e.g. an
 * `<IQLocationManager googleMapsApiKey>` prop) wins, otherwise fall back to the
 * SDK config set via `initialize({ googleMapsApiKey })`. Returns undefined when
 * neither is set — callers degrade to manual address entry.
 */
export function resolveGoogleMapsKey(explicit?: string): string | undefined {
  if (explicit) return explicit;
  try {
    return getConfig().googleMapsApiKey;
  } catch {
    return undefined;
  }
}
