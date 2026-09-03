#!/usr/bin/env bash
# Regenerates src/generated/buildConfig.ts from the environment.
#
# Reads six GitHub repository variables — three per shippable environment:
#
#   STAGING_ADDRESSIQ_API_BASE_URL     PROD_ADDRESSIQ_API_BASE_URL
#   STAGING_ADDRESSIQ_INGEST_BASE_URL  PROD_ADDRESSIQ_INGEST_BASE_URL
#   STAGING_ADDRESSIQ_CDN_BASE_URL     PROD_ADDRESSIQ_CDN_BASE_URL
#
# `development` is NOT baked: it points at the host machine's backend, so it is
# a local concern and stays the DEV_HOST literal in src/config.ts.
#
# FOUR further constants come from FILES at the repo root, NOT from the
# environment — the widget pin, PER DEPLOYMENT:
#
#   .widget-version-staging / .widget-integrity-staging
#     STILL GENERATED, BUT NO LONGER READ BY THE SDK. Every deployment loads the
#     widget from the PRODUCTION CDN (see DEPLOYMENT_URLS in src/config.ts), so
#     only the prod pin is consulted. They are kept because the web repo's CDN
#     workflow writes them and other tooling reads them; do not assume a stale
#     staging pin can break a build any more.
#   .widget-version-prod    / .widget-integrity-prod
#
# staging and prod publish independently (different versions) and their bundles
# differ byte-for-byte (per-environment Maps key), so a single global pin cannot
# satisfy both. Written by the widget-fanout workflow in addressiq-web. They are
# OPTIONAL: absent/empty -> "" (the SDK then has no CDN pin for that deployment)
# — so --strict does NOT require them, only the six URL vars. Legacy fallback:
# the old single .widget-version / .widget-integrity fills BOTH when the per-env
# files are absent.
#
# Usage:
#   scripts/bake-build-config.sh            # unset vars keep their defaults (local)
#   scripts/bake-build-config.sh --strict   # unset vars are a hard error (release)
#
# --strict is what release.yml uses. The old workflow sed'd each key and printed
# "unset — keeping checked-in default" — which meant a misconfigured release
# published a package pointing at whatever was committed, silently. A release
# that cannot see its config should fail, not guess.

set -euo pipefail

cd "$(dirname "$0")/.."
OUT="src/generated/buildConfig.ts"

# SDK version, from package.json — the file release-please bumps. Baked rather
# than hardcoded in TypeScript so it cannot drift from the published package:
# x-sdk-version sat at '0.1.0' from the first release through 0.10.0.
V_SDK_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || printf '')"

STRICT=0
[ "${1:-}" = "--strict" ] && STRICT=1

# name|default — defaults mirror the checked-in file and are the public hosts.
DEFAULTS="
STAGING_ADDRESSIQ_API_BASE_URL|https://api-staging.addressiqpro.com
STAGING_ADDRESSIQ_INGEST_BASE_URL|https://ingest-api-staging.addressiqpro.com
STAGING_ADDRESSIQ_CDN_BASE_URL|https://cdn-staging.addressiqpro.com
PROD_ADDRESSIQ_API_BASE_URL|https://api.addressiqpro.com
PROD_ADDRESSIQ_INGEST_BASE_URL|https://ingest-api.addressiqpro.com
PROD_ADDRESSIQ_CDN_BASE_URL|https://cdn.addressiqpro.com
"

missing=""

# NB: assign into V_<NAME> directly rather than via `$(resolve …)`. A command
# substitution runs in a subshell, so a `missing` recorded inside one is thrown
# away — which silently turned --strict into a no-op that baked empty strings.
while IFS='|' read -r name default; do
  [ -n "$name" ] || continue
  val="${!name:-}"
  if [ -z "$val" ]; then
    if [ "$STRICT" = "1" ]; then
      missing="$missing $name"
      continue
    fi
    val="$default"
  fi
  # A base URL with a trailing slash concatenates into `//path`; normalise.
  eval "V_$name=\"\${val%/}\""
done <<< "$DEFAULTS"


# The widget pins are repo-root FILES (see header), PER DEPLOYMENT:
#   .widget-version-staging / .widget-integrity-staging
#   .widget-version-prod    / .widget-integrity-prod
# Absent or empty -> "". Never required, not even under --strict: they
# legitimately do not exist until the first widget fan-out lands. For
# back-compat, the legacy single .widget-version / .widget-integrity (the
# prod-fanned pin) is the fallback for BOTH when the per-env files are absent.
read_widget_file() {
  [ -f "$1" ] || { printf ''; return 0; }
  # trim whitespace/newlines
  tr -d '\r\n' < "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

# The file carries a "vX.Y.Z" tag; the CDN path is built as /v{version}/, so
# strip the leading "v" here and keep exactly one source of the prefix.
STAGING_WIDGET_VERSION="$(read_widget_file .widget-version-staging)"
[ -n "$STAGING_WIDGET_VERSION" ] || STAGING_WIDGET_VERSION="$(read_widget_file .widget-version)"
STAGING_WIDGET_VERSION="${STAGING_WIDGET_VERSION#v}"
STAGING_WIDGET_INTEGRITY="$(read_widget_file .widget-integrity-staging)"
[ -n "$STAGING_WIDGET_INTEGRITY" ] || STAGING_WIDGET_INTEGRITY="$(read_widget_file .widget-integrity)"

PROD_WIDGET_VERSION="$(read_widget_file .widget-version-prod)"
[ -n "$PROD_WIDGET_VERSION" ] || PROD_WIDGET_VERSION="$(read_widget_file .widget-version)"
PROD_WIDGET_VERSION="${PROD_WIDGET_VERSION#v}"
PROD_WIDGET_INTEGRITY="$(read_widget_file .widget-integrity-prod)"
[ -n "$PROD_WIDGET_INTEGRITY" ] || PROD_WIDGET_INTEGRITY="$(read_widget_file .widget-integrity)"

if [ -n "$missing" ]; then
  echo "::error::--strict: required build variables are unset:$missing" >&2
  echo "A release must not fall back to checked-in defaults. Set them as GitHub repository variables." >&2
  exit 1
fi

cat > "$OUT" <<EOF
/**
 * Generated build-time configuration — DO NOT EDIT BY HAND.
 *
 * Rewritten wholesale by \`scripts/bake-build-config.sh\` at publish time from
 * the GitHub repository variables (see .github/workflows/release.yml):
 *
 *   STAGING_ADDRESSIQ_API_BASE_URL     PROD_ADDRESSIQ_API_BASE_URL
 *   STAGING_ADDRESSIQ_INGEST_BASE_URL  PROD_ADDRESSIQ_INGEST_BASE_URL
 *   STAGING_ADDRESSIQ_CDN_BASE_URL     PROD_ADDRESSIQ_CDN_BASE_URL
 *
 * The widget pin is baked from FILES at the repo root, PER DEPLOYMENT —
 * \`.widget-version-{staging,prod}\` and \`.widget-integrity-{staging,prod}\`,
 * written by the widget-fanout workflow in addressiq-web. staging and prod
 * publish independently and their bundles differ byte-for-byte (per-environment
 * Maps key), so each deployment pins its own \`{cdn}/v{version}/iqcollect.js\`
 * + SRI hash. Absent files bake to '' (no CDN pin for that deployment).
 *
 * The checked-in values below are the safe public defaults, so a local
 * \`npm run build\` and the test suite resolve real hosts with no substitution.
 * On a real release the baker runs with --strict and REQUIRES every variable
 * above — a published package must never silently carry a developer's default.
 *
 * This file is intentionally committed and shipped in the package because
 * react-native distributes source rather than a compiled bundle: there is no
 * later build step on the integrator's machine that could inject these.
 *
 * \`development\` is deliberately NOT baked from CI: it points at the host
 * machine's backend, so it is a local-only concern and stays a literal
 * (DEV_HOST) in src/config.ts. Never ship a build configured for
 * \`development\`.
 */
export const BUILD_STAGING_API_URL = '$V_STAGING_ADDRESSIQ_API_BASE_URL';
export const BUILD_STAGING_INGEST_URL = '$V_STAGING_ADDRESSIQ_INGEST_BASE_URL';
export const BUILD_STAGING_CDN_URL = '$V_STAGING_ADDRESSIQ_CDN_BASE_URL';

export const BUILD_PROD_API_URL = '$V_PROD_ADDRESSIQ_API_BASE_URL';
export const BUILD_PROD_INGEST_URL = '$V_PROD_ADDRESSIQ_INGEST_BASE_URL';
export const BUILD_PROD_CDN_URL = '$V_PROD_ADDRESSIQ_CDN_BASE_URL';

// Widget pins are PER DEPLOYMENT: staging and prod publish independently and
// their bundles differ byte-for-byte (per-environment Maps key), so their SRI
// hashes differ — a single global pin cannot satisfy both. \`''\` when absent.
// \`development\` reuses the PROD pins (its cdnUrl is the prod CDN).

/** Staging widget version on the CDN, WITHOUT the leading \`v\` (e.g. \`0.4.2\`). */
export const BUILD_STAGING_WIDGET_VERSION = '$STAGING_WIDGET_VERSION';
/** SRI hash of \`{staging cdn}/v{version}/iqcollect.js\`. */
export const BUILD_STAGING_WIDGET_INTEGRITY = '$STAGING_WIDGET_INTEGRITY';

/** Production widget version on the CDN, WITHOUT the leading \`v\` (e.g. \`0.5.3\`). */
export const BUILD_PROD_WIDGET_VERSION = '$PROD_WIDGET_VERSION';
/** SRI hash of \`{prod cdn}/v{version}/iqcollect.js\`. */
export const BUILD_PROD_WIDGET_INTEGRITY = '$PROD_WIDGET_INTEGRITY';

/**
 * This SDK's version, baked from package.json. Sent as \`x-sdk-version\` and
 * used for the telemetry envelope, so neither can drift from the release.
 */
export const BUILD_SDK_VERSION = '$V_SDK_VERSION';
EOF

echo "[bake] wrote $OUT"
grep -E '^export const' "$OUT" | sed 's/^/  /'
