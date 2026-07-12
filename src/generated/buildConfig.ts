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
 * TWO further constants are baked from FILES at the repo root rather than from
 * the environment — `.widget-version` and `.widget-integrity`, written by the
 * widget-fanout workflow in addressiq-web on every web release alongside the
 * vendored widget bundle. They pin the CDN copy of the widget
 * (`{cdn}/v{version}/iqcollect.js` + its SRI hash). When the files are absent
 * both constants bake to '' and the SDK simply inlines the bundled widget.
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

/** Widget version published to the CDN, WITHOUT the leading `v` (e.g. `0.4.0`).
 *  Baked from the `.widget-version` file; `''` when absent. */
export const BUILD_WIDGET_VERSION = '';

/** Subresource-Integrity hash of `{cdn}/v{version}/iqcollect.js` (e.g. `sha384-…`).
 *  Baked from the `.widget-integrity` file; `''` when absent. */
export const BUILD_WIDGET_INTEGRITY = '';
