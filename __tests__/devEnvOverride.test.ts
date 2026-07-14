/**
 * Development-only host overrides.
 *
 * They exist because the `development` hosts are a compiled-in literal, and
 * `10.0.2.2` is an Android-EMULATOR alias that a physical device cannot reach.
 *
 * React Native ships SOURCE and has no build step of its own, so the SDK cannot
 * count on `process.env` being inlined — the host app passes the values in via
 * the `dev*` config fields (from react-native-config, a dotenv babel plugin,
 * Expo, whatever it uses). `process.env` is honoured when the app's bundler does
 * inline it.
 *
 * The load-bearing property is the gate: an override is honoured ONLY in
 * `development` and throws anywhere else.
 */
import { setConfig, resolveUrls, resetConfig, devOverride } from '../src/config';

const LAN = 'http://192.168.1.5:4000';

describe('dev host overrides', () => {
  afterEach(() => resetConfig());

  it('honours the config field in development', () => {
    setConfig({ apiKey: 'aiq_test_k', deployment: 'development', devApiUrl: LAN });
    expect(resolveUrls().apiUrl).toBe(LAN);
  });

  it('leaves the other hosts alone — each override is independent', () => {
    setConfig({ apiKey: 'aiq_test_k', deployment: 'development', devApiUrl: LAN });
    const urls = resolveUrls();
    expect(urls.apiUrl).toBe(LAN);
    expect(urls.ingestUrl).not.toBe(LAN);
    expect(urls.ingestUrl).toContain(':4000');
    expect(urls.cdnUrl).not.toBe(LAN);
  });

  it('is a no-op when nothing is set', () => {
    setConfig({ apiKey: 'aiq_test_k', deployment: 'development' });
    expect(resolveUrls().apiUrl).toContain(':4000');
  });
});

describe('the gate — overrides cannot escape development', () => {
  afterEach(() => resetConfig());

  it('throws when a host override is set on a shipped deployment', () => {
    for (const d of ['production', 'staging'] as const) {
      setConfig({ apiKey: 'aiq_live_k', deployment: d, devApiUrl: LAN });
      expect(() => resolveUrls()).toThrow(/development-only/);
      resetConfig();
    }
  });

  it('names the variable and the offending deployment', () => {
    expect(() => devOverride('production', 'ADDRESSIQ_DEV_API_URL', LAN)).toThrow(
      /ADDRESSIQ_DEV_API_URL/,
    );
    expect(() => devOverride('production', 'ADDRESSIQ_DEV_API_URL', LAN)).toThrow(/production/);
  });

  it('a shipped build that sets nothing resolves normally', () => {
    // The throw must fire only when someone actually supplies an override.
    setConfig({ apiKey: 'aiq_live_k', deployment: 'production' });
    expect(resolveUrls().apiUrl).toMatch(/^https:\/\//);
    expect(devOverride('production', 'ADDRESSIQ_DEV_API_URL', undefined)).toBeUndefined();
  });
});
