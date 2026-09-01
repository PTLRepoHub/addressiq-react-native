/**
 * Widget pin selection.
 *
 * This used to assert the opposite: that each deployment resolved to its own
 * pin, staging included. That was the design, and it was fragile — the staging
 * bundle is deliberately not byte-identical to production and publishes on its
 * own schedule, so a build was correct only while its staging pin matched what
 * that CDN happened to be serving. A prebuilt demo APK carried the prod pin
 * with the staging CDN and every verification on it died with an SRI mismatch.
 *
 * Every deployment now loads the widget from the production CDN, matching
 * Android and iOS. See __tests__/widgetCdnPinning.test.ts for the invariant.
 */
import { setConfig, resolveUrls, resetConfig } from '../src/config';
import { buildHtml } from '../src/ui/widgetHtml';
import {
  BUILD_STAGING_WIDGET_VERSION,
  BUILD_STAGING_WIDGET_INTEGRITY,
  BUILD_PROD_WIDGET_VERSION,
  BUILD_PROD_WIDGET_INTEGRITY,
} from '../src/generated/buildConfig';

describe('per-deployment widget pin', () => {
  afterEach(() => resetConfig());

  it('staging resolves the PROD pin, not the staging one', () => {
    setConfig({ apiKey: 'aiq_test_k', deployment: 'staging' });
    const urls = resolveUrls();
    expect(urls.widgetVersion).toBe(BUILD_PROD_WIDGET_VERSION);
    expect(urls.widgetIntegrity).toBe(BUILD_PROD_WIDGET_INTEGRITY);
    expect(urls.cdnUrl).not.toContain('cdn-staging');
    // The staging pin is still generated, and is now simply not read.
    expect(urls.widgetIntegrity).not.toBe(BUILD_STAGING_WIDGET_INTEGRITY);
  });

  it('production resolves the prod pin', () => {
    setConfig({ apiKey: 'aiq_live_k', deployment: 'production' });
    const urls = resolveUrls();
    expect(urls.widgetVersion).toBe(BUILD_PROD_WIDGET_VERSION);
    expect(urls.widgetIntegrity).toBe(BUILD_PROD_WIDGET_INTEGRITY);
    expect(urls.cdnUrl).not.toContain('cdn-staging');
  });

  it('development reuses the prod pin + prod CDN', () => {
    setConfig({ apiKey: 'aiq_test_k', deployment: 'development' });
    const urls = resolveUrls();
    expect(urls.widgetVersion).toBe(BUILD_PROD_WIDGET_VERSION);
    expect(urls.widgetIntegrity).toBe(BUILD_PROD_WIDGET_INTEGRITY);
    expect(urls.cdnUrl).not.toContain('cdn-staging');
  });

  it('buildHtml renders the resolved deployment pin into the CDN <script>', () => {
    for (const deployment of ['staging', 'production'] as const) {
      resetConfig();
      setConfig({ apiKey: 'aiq_k', deployment });
      const u = resolveUrls();
      const html = buildHtml({
        apiKey: 'aiq_k',
        appUserId: 'cust_1',
        deployment,
        cdnUrl: u.cdnUrl,
        widgetVersion: u.widgetVersion,
        widgetIntegrity: u.widgetIntegrity,
      });
      // The pin now reaches the tag as a property on an injected element (the
      // load is retried, so it cannot be a one-shot inline tag) rather than as an
      // `integrity="…"` attribute. What matters is unchanged: the resolved
      // deployment's version and hash are the ones the WebView loads under.
      expect(html).toContain(`${u.cdnUrl}/v${u.widgetVersion}/iqcollect.js`);
      expect(html).toContain(`var __IQ_INTEGRITY = "${u.widgetIntegrity}"`);
      expect(html).toContain('s.integrity = __IQ_INTEGRITY');
      expect(html).toContain("s.crossOrigin = 'anonymous'");
    }
  });
});
