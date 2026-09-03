/**
 * Generated build-time configuration — DO NOT EDIT BY HAND.
 *
 * Rewritten wholesale by `scripts/bake-build-config.sh` at publish time from
 * the GitHub repository variables (see .github/workflows/release.yml):
 *
 *   STAGING_ADDRESSIQ_API_BASE_URL     PROD_ADDRESSIQ_API_BASE_URL
 *   STAGING_ADDRESSIQ_INGEST_BASE_URL  PROD_ADDRESSIQ_INGEST_BASE_URL
 *   STAGING_ADDRESSIQ_CDN_BASE_URL     PROD_ADDRESSIQ_CDN_BASE_URL
 *
 * The widget pin is baked from FILES at the repo root, PER DEPLOYMENT —
 * `.widget-version-{staging,prod}` and `.widget-integrity-{staging,prod}`,
 * written by the widget-fanout workflow in addressiq-web. staging and prod
 * publish independently and their bundles differ byte-for-byte (per-environment
 * Maps key), so each deployment pins its own `{cdn}/v{version}/iqcollect.js`
 * + SRI hash. Absent files bake to '' (no CDN pin for that deployment).
 *
 * The checked-in values below are the safe public defaults, so a local
 * `npm run build` and the test suite resolve real hosts with no substitution.
 * On a real release the baker runs with --strict and REQUIRES every variable
 * above — a published package must never silently carry a developer's default.
 *
 * This file is intentionally committed and shipped in the package because
 * react-native distributes source rather than a compiled bundle: there is no
 * later build step on the integrator's machine that could inject these.
 *
 * `development` is deliberately NOT baked from CI: it points at the host
 * machine's backend, so it is a local-only concern and stays a literal
 * (DEV_HOST) in src/config.ts. Never ship a build configured for
 * `development`.
 */
export const BUILD_STAGING_API_URL = 'https://api-staging.addressiqpro.com';
export const BUILD_STAGING_INGEST_URL = 'https://ingest-api-staging.addressiqpro.com';
export const BUILD_STAGING_CDN_URL = 'https://cdn-staging.addressiqpro.com';

export const BUILD_PROD_API_URL = 'https://api.addressiqpro.com';
export const BUILD_PROD_INGEST_URL = 'https://ingest-api.addressiqpro.com';
export const BUILD_PROD_CDN_URL = 'https://cdn.addressiqpro.com';

// Widget pins are PER DEPLOYMENT: staging and prod publish independently and
// their bundles differ byte-for-byte (per-environment Maps key), so their SRI
// hashes differ — a single global pin cannot satisfy both. `''` when absent.
// `development` reuses the PROD pins (its cdnUrl is the prod CDN).

/** Staging widget version on the CDN, WITHOUT the leading `v` (e.g. `0.4.2`). */
export const BUILD_STAGING_WIDGET_VERSION = '0.5.3';
/** SRI hash of `{staging cdn}/v{version}/iqcollect.js`. */
export const BUILD_STAGING_WIDGET_INTEGRITY = 'sha384-Q7LZd2vji9K0ulAu866ywpCzIj0aoaZAl9n9Ghw1lkf8aT84y++RT/9rHcAIuYJB';

/** Production widget version on the CDN, WITHOUT the leading `v` (e.g. `0.5.3`). */
export const BUILD_PROD_WIDGET_VERSION = '0.5.3';
/** SRI hash of `{prod cdn}/v{version}/iqcollect.js`. */
export const BUILD_PROD_WIDGET_INTEGRITY = 'sha384-wUErWmll1WWgesjXvSN93KLxHTDLNXdZ4FMR9nT2tQ7tpdBdEuQCDMkHgdssRvkb';

/**
 * This SDK's version, baked from package.json. Sent as `x-sdk-version` and
 * used for the telemetry envelope, so neither can drift from the release.
 */
export const BUILD_SDK_VERSION = '0.10.0';
