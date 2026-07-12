/**
 * Build-time constant for the production API base URL.
 *
 * The checked-in value below is the safe public default so local builds and
 * tests resolve a real production host. At publish time, the release workflow
 * overwrites the string literal with `${{ vars.ADDRESSIQ_API_URL }}` (see
 * .github/workflows/release.yml). If that variable is unset, the default here
 * is preserved. This file is intentionally committed and shipped in the package
 * because react-native distributes source rather than a compiled bundle.
 */
export const BUILD_API_URL = 'https://api.addressiqpro.com';

/**
 * Build-time constant for the production telemetry/transit-event ingest host.
 *
 * Same lifecycle as BUILD_API_URL above: the checked-in value is the safe public
 * default, and the release workflow overwrites the string literal with
 * `${{ vars.ADDRESSIQ_INGEST_URL }}` at publish time, preserving this default
 * when the variable is unset.
 */
export const BUILD_INGEST_URL = 'https://ingest-api.addressiqpro.com';
