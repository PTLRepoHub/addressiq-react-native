import { setConfig, resolveUrls, resetConfig } from '../src/config';
import {
  BUILD_PROD_CDN_URL,
  BUILD_PROD_WIDGET_INTEGRITY,
  BUILD_PROD_WIDGET_VERSION,
  BUILD_STAGING_CDN_URL,
} from '../src/generated/buildConfig';

/**
 * Every deployment must load the widget from the PRODUCTION CDN.
 *
 * This is not a preference, it is what makes the SRI pin satisfiable. The
 * staging bundle is deliberately not byte-identical to production (it bakes the
 * staging Maps key) and publishes on its own schedule, so a build pointing
 * staging at the staging CDN is correct only while its staging pin happens to
 * match what that CDN is serving.
 *
 * It did not. A prebuilt demo APK carried the production pin and the staging
 * CDN, and every verification on it failed with a Subresource-Integrity
 * mismatch and a blank widget — reported from the field, and invisible until
 * then because the error listed three possible causes and could not say which.
 *
 * The bundle is environment-agnostic at runtime: it bakes both environments'
 * hosts and switches on the deployment the SDK passes it, so production bytes
 * drive a staging verification correctly. Android and iOS already do this.
 */
describe('widget CDN pinning', () => {
  const deployments = ['production', 'staging', 'development'] as const;

  afterEach(() => resetConfig());

  /** `resolveUrls` reads the configured deployment rather than taking one. */
  function urlsFor(deployment: (typeof deployments)[number]) {
    setConfig({ apiKey: 'aiq_test_k', deployment });
    return resolveUrls();
  }

  it.each(deployments)('%s loads the widget from the production CDN', (deployment) => {
    const urls = urlsFor(deployment);
    expect(urls.cdnUrl).toBe(BUILD_PROD_CDN_URL);
    expect(urls.widgetVersion).toBe(BUILD_PROD_WIDGET_VERSION);
    expect(urls.widgetIntegrity).toBe(BUILD_PROD_WIDGET_INTEGRITY);
  });

  it('never serves the widget from the staging CDN', () => {
    // Named explicitly: the staging host is still a legitimate API/ingest
    // target, so it stays in the build config. What must not happen is the
    // widget being fetched from it, because no pin we hold can match it.
    for (const deployment of deployments) {
      expect(urlsFor(deployment).cdnUrl).not.toBe(BUILD_STAGING_CDN_URL);
    }
  });

  it('still routes API and ingest per deployment', () => {
    // The CDN is shared; everything else is not. If this ever collapses too,
    // a staging build would silently talk to production.
    const staging = urlsFor('staging');
    const production = urlsFor('production');
    expect(staging.apiUrl).not.toBe(production.apiUrl);
    expect(staging.ingestUrl).not.toBe(production.ingestUrl);
  });
});
