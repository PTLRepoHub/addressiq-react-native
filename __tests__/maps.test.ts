import {
  placesAutocomplete,
  placeDetails,
  reverseGeocode,
  streetViewCoverage,
} from '../src/maps/client';

const KEY = 'test_maps_key';

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('maps client — Places Autocomplete (New)', () => {
  it('maps suggestions to {placeId, primaryText, secondaryText}', async () => {
    mockFetchOnce({
      suggestions: [
        {
          placePrediction: {
            placeId: 'place_1',
            text: { text: '1 Marina, Lagos' },
            structuredFormat: {
              mainText: { text: '1 Marina' },
              secondaryText: { text: 'Lagos Island, Lagos' },
            },
          },
        },
      ],
    });
    const out = await placesAutocomplete('1 marina', KEY, 'sess');
    expect(out).toEqual([
      { placeId: 'place_1', primaryText: '1 Marina', secondaryText: 'Lagos Island, Lagos' },
    ]);
  });

  it('returns [] for empty input or missing key without calling fetch', async () => {
    const spy = jest.fn();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = spy;
    expect(await placesAutocomplete('', KEY)).toEqual([]);
    expect(await placesAutocomplete('x', '')).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns [] on a non-OK HTTP response (graceful)', async () => {
    mockFetchOnce({}, false, 403);
    expect(await placesAutocomplete('marina', KEY)).toEqual([]);
  });
});

describe('maps client — Place Details (New)', () => {
  it('resolves a placeId to formattedAddress + coordinates', async () => {
    mockFetchOnce({
      formattedAddress: '1 Marina, Lagos Island, Lagos, Nigeria',
      location: { latitude: 6.5244, longitude: 3.3792 },
    });
    expect(await placeDetails('place_1', KEY, 'sess')).toEqual({
      formattedAddress: '1 Marina, Lagos Island, Lagos, Nigeria',
      lat: 6.5244,
      lon: 3.3792,
    });
  });

  it('returns null when location is missing', async () => {
    mockFetchOnce({ formattedAddress: 'x' });
    expect(await placeDetails('place_1', KEY)).toBeNull();
  });
});

describe('maps client — reverse geocode', () => {
  it('returns the first formatted_address on status OK', async () => {
    mockFetchOnce({ status: 'OK', results: [{ formatted_address: '12 Broad St, Lagos' }] });
    expect(await reverseGeocode(6.52, 3.37, KEY)).toBe('12 Broad St, Lagos');
  });

  it('returns null on ZERO_RESULTS', async () => {
    mockFetchOnce({ status: 'ZERO_RESULTS', results: [] });
    expect(await reverseGeocode(0, 0, KEY)).toBeNull();
  });
});

describe('maps client — Street View coverage gate', () => {
  it('available=true with panoId when metadata status is OK', async () => {
    mockFetchOnce({ status: 'OK', pano_id: 'PANO123', location: { lat: 6.5244, lng: 3.3792 } });
    expect(await streetViewCoverage(6.5244, 3.3792, KEY)).toEqual({
      available: true,
      panoId: 'PANO123',
      lat: 6.5244,
      lon: 3.3792,
    });
  });

  it('available=false on ZERO_RESULTS (fall back to 2D pin)', async () => {
    mockFetchOnce({ status: 'ZERO_RESULTS' });
    expect(await streetViewCoverage(80, 0, KEY)).toEqual({ available: false });
  });

  it('available=false (no fetch) without a key', async () => {
    const spy = jest.fn();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = spy;
    expect(await streetViewCoverage(6.5, 3.3, '')).toEqual({ available: false });
    expect(spy).not.toHaveBeenCalled();
  });
});
