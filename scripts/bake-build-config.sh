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
# TWO further constants come from FILES at the repo root, NOT from the
# environment:
#
#   .widget-version    e.g. "v0.4.0"      -> widget version (leading "v" stripped)
#   .widget-integrity  e.g. "sha384-abc…" -> SRI hash of that widget bundle
#
# Both are written by the widget-fanout workflow in addressiq-web on every web
# release, next to the vendored widget bundle. They pin the CDN copy of the
# widget ({cdn}/v{version}/iqcollect.js). They are OPTIONAL: when the files are
# absent (or empty) both constants bake to "" and the SDK inlines the bundled
# widget instead — so --strict does NOT require them, only the six URL vars.
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


# .widget-version / .widget-integrity are repo-root FILES (see header). Absent
# or empty -> "". Never required, not even under --strict: they legitimately do
# not exist until the first widget fan-out lands.
read_widget_file() {
  [ -f "$1" ] || { printf ''; return 0; }
  # trim whitespace/newlines
  tr -d '\r\n' < "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

WIDGET_VERSION="$(read_widget_file .widget-version)"
# The file carries a "vX.Y.Z" tag; the CDN path is built as /v{version}/, so
# strip the leading "v" here and keep exactly one source of the prefix.
WIDGET_VERSION="${WIDGET_VERSION#v}"
WIDGET_INTEGRITY="$(read_widget_file .widget-integrity)"

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
 * TWO further constants are baked from FILES at the repo root rather than from
 * the environment — \`.widget-version\` and \`.widget-integrity\`, written by the
 * widget-fanout workflow in addressiq-web on every web release alongside the
 * vendored widget bundle. They pin the CDN copy of the widget
 * (\`{cdn}/v{version}/iqcollect.js\` + its SRI hash). When the files are absent
 * both constants bake to '' and the SDK simply inlines the bundled widget.
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

/** Widget version published to the CDN, WITHOUT the leading \`v\` (e.g. \`0.4.0\`).
 *  Baked from the \`.widget-version\` file; \`''\` when absent. */
export const BUILD_WIDGET_VERSION = '$WIDGET_VERSION';

/** Subresource-Integrity hash of \`{cdn}/v{version}/iqcollect.js\` (e.g. \`sha384-…\`).
 *  Baked from the \`.widget-integrity\` file; \`''\` when absent. */
export const BUILD_WIDGET_INTEGRITY = '$WIDGET_INTEGRITY';
EOF

echo "[bake] wrote $OUT"
grep -E '^export const' "$OUT" | sed 's/^/  /'
