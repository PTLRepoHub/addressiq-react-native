import { Platform } from 'react-native';
import type { AddressIQConfig, AddressIQEnvironment, EnvironmentURLs } from './types';
import { AddressIQError } from './errors';
import {
  BUILD_PROD_API_URL,
  BUILD_PROD_CDN_URL,
  BUILD_PROD_INGEST_URL,
  BUILD_STAGING_API_URL,
  BUILD_STAGING_CDN_URL,
  BUILD_STAGING_INGEST_URL,
} from './generated/buildConfig';

/**
 * Compiled-in dev backend host. Emulator-aware: the Android emulator reaches
 * the host machine's loopback via the special `10.0.2.2` alias, while the iOS
 * simulator (and everything else) uses `localhost`. A single host serves both
 * API and ingest in development.
 */
const DEV_HOST = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';

/**
 * Per-environment URLs. `production` and `staging` are baked in at publish time
 * from the `PROD_*` / `STAGING_*` GitHub variables (see
 * scripts/bake-build-config.sh); `development` is deliberately NOT baked — it
 * points at the host machine's backend, so it stays the DEV_HOST literal above.
 *
 * The verify WebView loads the widget from `cdnUrl`, CDN-first: the immutable,
 * version-addressed `{cdnUrl}/v{x.y.z}/iqcollect.js` with a Subresource-Integrity
 * pin (BUILD_WIDGET_INTEGRITY), falling back to the bundled WIDGET_JS on a CDN
 * outage, offline device, or SRI mismatch — see src/ui/widgetHtml.ts.
 * `development` resolves to the local host and is excluded from the CDN path; it
 * inlines the bundle.
 */
const ENVIRONMENT_URLS: Record<AddressIQEnvironment, EnvironmentURLs> = {
  production: {
    apiUrl: BUILD_PROD_API_URL,
    ingestUrl: BUILD_PROD_INGEST_URL,
    cdnUrl: BUILD_PROD_CDN_URL,
    privacyPolicyUrl: 'https://addressiqpro.com/privacy',
    termsUrl: 'https://addressiqpro.com/terms',
  },
  staging: {
    apiUrl: BUILD_STAGING_API_URL,
    ingestUrl: BUILD_STAGING_INGEST_URL,
    cdnUrl: BUILD_STAGING_CDN_URL,
    privacyPolicyUrl: 'https://staging.addressiqpro.com/privacy',
    termsUrl: 'https://staging.addressiqpro.com/terms',
  },
  development: {
    apiUrl: DEV_HOST,
    ingestUrl: DEV_HOST,
    cdnUrl: DEV_HOST,
    privacyPolicyUrl: 'http://localhost:3000/privacy',
    termsUrl: 'http://localhost:3000/terms',
  },
};

let _config: AddressIQConfig | null = null;

export function setConfig(config: AddressIQConfig): void {
  _config = { ...config, environment: config.environment ?? 'production' };
}

export function getConfig(): AddressIQConfig {
  if (!_config) {
    throw new AddressIQError('SDK_NOT_INITIALIZED', 'SDK not initialized — call initialize() first.');
  }
  return _config;
}

export function resolveUrls(): EnvironmentURLs {
  const cfg = getConfig();
  return ENVIRONMENT_URLS[cfg.environment ?? 'production'];
}

export function resetConfig(): void {
  _config = null;
}
