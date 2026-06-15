/**
 * Google Maps Platform REST clients for the Collect UI map flow.
 *
 * Pure `fetch` wrappers — no native dependency — so the address stage can:
 *   - search via Places Autocomplete (New),
 *   - resolve a picked place to coordinates + a canonical formatted address,
 *   - reverse-geocode a dragged map pin to a formatted address,
 *   - check Street View coverage (free metadata) before offering the 3D step.
 *
 * Every call is best-effort: on any error it resolves to an empty/falsy result
 * so the widget degrades gracefully to manual entry rather than throwing.
 */

const PLACES_BASE = 'https://places.googleapis.com/v1';
const MAPS_BASE = 'https://maps.googleapis.com/maps/api';

export interface PlaceSuggestion {
  placeId: string;
  /** Full one-line label, e.g. "1 Marina, Lagos Island, Lagos, Nigeria". */
  primaryText: string;
  /** Optional secondary line (locality / region). */
  secondaryText?: string;
}

export interface ResolvedPlace {
  formattedAddress: string;
  lat: number;
  lon: number;
}

/**
 * Places Autocomplete (New) — POST places:autocomplete. Returns up to a handful
 * of typeahead suggestions. `sessionToken` ties keystrokes to one billable
 * session; pass a stable token per search session.
 */
export async function placesAutocomplete(
  input: string,
  apiKey: string,
  sessionToken?: string,
): Promise<PlaceSuggestion[]> {
  if (!input.trim() || !apiKey) return [];
  try {
    const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({ input, ...(sessionToken ? { sessionToken } : {}) }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }>;
    };
    return (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
      .map((p) => ({
        placeId: p.placeId,
        primaryText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        secondaryText: p.structuredFormat?.secondaryText?.text,
      }));
  } catch {
    return [];
  }
}

/**
 * Place Details (New) — resolve a placeId to its canonical formatted address +
 * coordinates. Pass the same `sessionToken` used for autocomplete to close the
 * billing session.
 */
export async function placeDetails(
  placeId: string,
  apiKey: string,
  sessionToken?: string,
): Promise<ResolvedPlace | null> {
  if (!placeId || !apiKey) return null;
  try {
    const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : '';
    const res = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}${qs}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'formattedAddress,location',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    };
    if (data.location?.latitude == null || data.location?.longitude == null) return null;
    return {
      formattedAddress: data.formattedAddress ?? '',
      lat: data.location.latitude,
      lon: data.location.longitude,
    };
  } catch {
    return null;
  }
}

/**
 * Reverse-geocode a coordinate (e.g. the dragged map pin or current GPS fix) to
 * Google's canonical `formatted_address`. Returns null when there's no result.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  apiKey: string,
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `${MAPS_BASE}/geocode/json?latlng=${lat},${lon}&key=${encodeURIComponent(apiKey)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status: string;
      results?: Array<{ formatted_address?: string }>;
    };
    if (data.status !== 'OK') return null;
    return data.results?.[0]?.formatted_address ?? null;
  } catch {
    return null;
  }
}

export interface StreetViewCoverage {
  available: boolean;
  panoId?: string;
  /** Snapped pano coordinate (may differ slightly from the query point). */
  lat?: number;
  lon?: number;
}

/**
 * Street View Image Metadata — free, no quota. Use it to decide whether to
 * offer the Street View pin-confirm step. `status === 'OK'` means a panorama
 * exists near the point; `ZERO_RESULTS` means fall back to the 2D pin.
 */
export async function streetViewCoverage(
  lat: number,
  lon: number,
  apiKey: string,
): Promise<StreetViewCoverage> {
  if (!apiKey) return { available: false };
  try {
    const res = await fetch(
      `${MAPS_BASE}/streetview/metadata?location=${lat},${lon}&key=${encodeURIComponent(apiKey)}`,
    );
    if (!res.ok) return { available: false };
    const data = (await res.json()) as {
      status: string;
      pano_id?: string;
      location?: { lat?: number; lng?: number };
    };
    if (data.status !== 'OK') return { available: false };
    return {
      available: true,
      panoId: data.pano_id,
      lat: data.location?.lat,
      lon: data.location?.lng,
    };
  } catch {
    return { available: false };
  }
}
