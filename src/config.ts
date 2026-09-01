import { Platform } from 'react-native';
import type { AddressIQConfig, AddressIQDeployment, DeploymentURLs } from './types';
import { AddressIQError } from './errors';
import {
  BUILD_PROD_API_URL,
  BUILD_PROD_CDN_URL,
  BUILD_PROD_INGEST_URL,
  BUILD_PROD_WIDGET_INTEGRITY,
  BUILD_PROD_WIDGET_VERSION,
  BUILD_STAGING_API_URL,
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
 * A development-only override, or undefined.
 *
 * Two sources, in order:
 *
 *   1. the `dev*` fields on `AddressIQConfig` — the reliable path. React Native
 *      ships SOURCE and has no build step of its own, so the SDK cannot count on
 *      `process.env` being inlined; the HOST APP supplies the values from its own
 *      env (react-native-config, a dotenv babel plugin, Expo, whatever it uses).
 *   2. `process.env.ADDRESSIQ_DEV_*` — works when the app's bundler does inline it
 *      (Expo, or babel-plugin-transform-inline-environment-variables). Guarded,
 *      because in a bare RN app `process.env.X` is simply undefined.
 *
 * They exist because the `development` hosts are otherwise the DEV_HOST literal,
 * and `10.0.2.2` is an Android-EMULATOR alias that a physical device cannot reach.
 *
 * Honoured ONLY in `development`. Supplied on any other deployment it throws — a
 * build-time value must never be able to point a shipped app at an arbitrary host,
 * and a security-relevant setting that silently does nothing is worse than a loud
 * failure.
 */
export function devOverride(
  deployment: AddressIQDeployment,
  name: string,
  fromConfig?: string,
): string | undefined {
  // Reached via globalThis rather than the `process` global: this package has no
  // @types/node (it targets React Native, not Node), and in a bare RN app
  // `process.env.X` is undefined anyway — so it must not be a hard reference.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const fromEnv = env?.[name];
  const value = fromConfig || fromEnv;
  if (!value) return undefined;
  if (deployment !== 'development') {
    throw new AddressIQError(
      'INVALID_CONFIG',
      `AddressIQ: ${name} is a development-only override, but deployment is ` +
        `"${deployment}". Outside development the SDK resolves its hosts from the values ` +
        `baked at release — it will not let a build-time value point a shipped app at an ` +
        `arbitrary host. Unset ${name}, or set deployment: 'development'.`,
    );
  }
  return value;
}

/**
 * Per-deployment URLs. `production` and `staging` are baked in at publish time
 * from the `PROD_*` / `STAGING_*` GitHub variables (see
 * scripts/bake-build-config.sh); `development` is deliberately NOT baked — it
 * points at the host machine's backend, so it stays the DEV_HOST literal above.
 *
 * The verify WebView loads the widget from `cdnUrl`, SRI-pinned: the immutable,
 * version-addressed `{cdnUrl}/v{widgetVersion}/iqcollect.js` checked against
 * `widgetIntegrity`.
 *
 * EVERY deployment loads it from the PRODUCTION CDN, matching the Android and
 * iOS SDKs. The bundle is environment-agnostic at runtime — it bakes both
 * environments' API and ingest hosts and switches on the deployment the SDK
 * hands it — so production bytes drive a staging verification correctly. Only
 * the baked Google Maps key differs.
 *
 * Pointing staging at the staging CDN, which is what this did, made the widget
 * fragile in a way nothing else was: the two bundles are deliberately NOT
 * byte-identical, and staging publishes on its own schedule, so a build was
 * correct only while its staging pin matched whatever that CDN happened to be
 * serving. A prebuilt demo APK shipped with the prod pin and the staging CDN,
 * and every verification on it died with an SRI mismatch and a blank widget.
 * The staging pin is no longer read for that reason.
 *
 * Override the host with devCdnUrl / ADDRESSIQ_DEV_CDN_URL (development only).
 */
const DEPLOYMENT_URLS: Record<AddressIQDeployment, DeploymentURLs> = {
  production: {
    apiUrl: BUILD_PROD_API_URL,
    ingestUrl: BUILD_PROD_INGEST_URL,
    cdnUrl: BUILD_PROD_CDN_URL,
    widgetVersion: BUILD_PROD_WIDGET_VERSION,
    widgetIntegrity: BUILD_PROD_WIDGET_INTEGRITY,
    privacyPolicyUrl: 'https://addressiqpro.com/privacy',
    termsUrl: 'https://addressiqpro.com/terms',
  },
  staging: {
    apiUrl: BUILD_STAGING_API_URL,
    ingestUrl: BUILD_STAGING_INGEST_URL,
    // Production CDN and pin, deliberately — see the note above. The deployment
    // still selects the API and ingest hosts; the widget switches to them at
    // runtime from the config the SDK passes it.
    cdnUrl: BUILD_PROD_CDN_URL,
    widgetVersion: BUILD_PROD_WIDGET_VERSION,
    widgetIntegrity: BUILD_PROD_WIDGET_INTEGRITY,
    privacyPolicyUrl: 'https://staging.addressiqpro.com/privacy',
    termsUrl: 'https://staging.addressiqpro.com/terms',
  },
  development: {
    apiUrl: DEV_HOST,
    ingestUrl: DEV_HOST,
    // Same production CDN + pin as the others. The local backend serves no
    // /v{x.y.z}/iqcollect.js of its own; override the host with devCdnUrl /
    // ADDRESSIQ_DEV_CDN_URL.
    cdnUrl: BUILD_PROD_CDN_URL,
    widgetVersion: BUILD_PROD_WIDGET_VERSION,
    widgetIntegrity: BUILD_PROD_WIDGET_INTEGRITY,
    privacyPolicyUrl: 'http://localhost:3000/privacy',
    termsUrl: 'http://localhost:3000/terms',
  },
};

let _config: AddressIQConfig | null = null;

export function setConfig(config: AddressIQConfig): void {
  _config = { ...config, deployment: config.deployment ?? 'production' };
}

export function getConfig(): AddressIQConfig {
  if (!_config) {
    throw new AddressIQError('SDK_NOT_INITIALIZED', 'SDK not initialized — call initialize() first.');
  }
  return _config;
}

/**
 * Resolve the hosts for the configured deployment.
 *
 * Throws on an unrecognised value rather than returning `undefined` URLs. RN
 * integrators are frequently on plain JS with no type checking, and a typo (or
 * the never-supported `'sandbox'`) would otherwise surface far from its cause.
 */
export function resolveUrls(): DeploymentURLs {
  const cfg = getConfig();
  const deployment = cfg.deployment ?? 'production';
  const urls = DEPLOYMENT_URLS[deployment];
  if (!urls) {
    const hint =
      (deployment as string) === 'sandbox'
        ? ' "sandbox" is not a deployment — it is a tenant mode, chosen by the API key' +
          ' you paste (aiq_test_… for sandbox, aiq_live_… for production), not by this' +
          ' field. If you meant the pre-production hosts, use "staging"; otherwise drop' +
          ' this field and use a sandbox key.'
        : '';
    throw new AddressIQError(
      'INVALID_CONFIG',
      `AddressIQ: unknown deployment "${deployment}". Expected one of ` +
        `${Object.keys(DEPLOYMENT_URLS).join(', ')}.${hint}`,
    );
  }

  // Development-only overrides. Each is independent — supplying the API host must
  // not drag the ingest or CDN host along with it. devOverride throws if any is
  // set on a shipped deployment.
  const apiUrl = devOverride(deployment, 'ADDRESSIQ_DEV_API_URL', cfg.devApiUrl);
  const ingestUrl = devOverride(deployment, 'ADDRESSIQ_DEV_INGEST_URL', cfg.devIngestUrl);
  const cdnUrl = devOverride(deployment, 'ADDRESSIQ_DEV_CDN_URL', cfg.devCdnUrl);
  if (!apiUrl && !ingestUrl && !cdnUrl) return urls;
  return {
    ...urls,
    apiUrl: apiUrl ?? urls.apiUrl,
    ingestUrl: ingestUrl ?? urls.ingestUrl,
    cdnUrl: cdnUrl ?? urls.cdnUrl,
  };
}


export function resetConfig(): void {
  _config = null;
}
