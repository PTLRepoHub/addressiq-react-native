# AddressIQ — React Native SDK (core)

[![CI](https://github.com/PTLRepoHub/addressiq-react-native/actions/workflows/ci.yml/badge.svg)](https://github.com/PTLRepoHub/addressiq-react-native/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@addressiq/react-native.svg)](https://www.npmjs.com/package/@addressiq/react-native)

`@addressiq/react-native` is the core (bare-workflow) React Native SDK — address
collect + verify lifecycle with a native TurboModule for background location.
No Expo dependency; it also runs in Expo apps via a dev build (it has native
code, so not Expo Go).

## Repository layout

```
.                  ← the SDK (@addressiq/react-native): src/, android/, ios/, podspec
  __tests__/       smoke test (jest)
  examples/core/   bare React Native example, linked to the LOCAL SDK
  examples/expo/   Expo (managed) example — same core SDK, via a dev build
```

Both examples consume the **same** core SDK via `@addressiq/react-native:
"file:../.."` (npm symlinks it), demonstrating that the core SDK works in both
bare-RN and Expo apps.

## Install

```bash
npm install @addressiq/react-native
# iOS:     cd ios && pod install
# Android: nothing extra — Gradle autolinks the native module
```

React Native ≥ 0.72 (TurboModule codegen). Runs in Expo via a dev build (not Expo Go — the SDK ships native code).

## Quick start

```ts
import { initialize, setUser, startVerification } from '@addressiq/react-native';

await initialize({ apiKey: 'aiq_live_…', deployment: 'production' });
await setUser({ appUserId: 'cust_123' });

// Verify an address you already collected (see Collect UI below):
const { verificationCode, status } = await startVerification({ locationCode: 'loc_…' });
```

## Collect UI (Track A — primary)

Drop in the `<IQLocationManager>` widget. It owns the themed multi-step flow
(`loading → permission → address → details → consent → success`) and the
in-flow permission rationale + settings redirect.

**Collect only — the widget does NOT start a verification.** It captures and
saves the address and returns its `locationCode`. You own *when* verification
begins: call `startVerification({ locationCode })` from the `onComplete`
callback. (Collection — geofence + background telemetry — is wired by
`startVerification`, not by the widget.)

```tsx
import { IQLocationManager, startVerification } from '@addressiq/react-native';

<IQLocationManager
  visible={open}
  apiKey={apiKey}
  appUserId={appUserId}
  environment="production"
  onComplete={async (result) => {
    // result: { locationCode, formattedAddress, lat, lon, placeId } — CollectResult.
    setOpen(false);
    // Host-driven verification — start it here:
    const v = await startVerification({ locationCode: result.locationCode });
    console.log(v.verificationCode); // → 'ver_…'
  }}
  onCancel={() => setOpen(false)}
/>
```

### Address map flow

The platform provisions the map key automatically — the widget fetches it from
the backend via `GET /api/v1/widget/config`, so integrators do **not** supply a
Google Maps key. When a key is configured on the platform, the address
step uses the map flow:

- **Current location** or **Places Autocomplete** search to set the point,
- a **draggable map pin** (`react-native-maps`),
- the **formatted address is auto-derived** (reverse geocode / place details) —
  it is read-only, not typed,
- where **Street View coverage** exists (checked via the free metadata endpoint),
  a **Street View pin-confirm** step (`react-native-webview`) captures the pano +
  heading.

`react-native-maps` and `react-native-webview` are **optional** peer
dependencies. Without them (or when the platform has no map key configured) the
step **degrades gracefully** to GPS + a manual formatted-address field. Install
for the full experience:

```sh
npm install react-native-maps react-native-webview
```

`onComplete` returns `CollectResult` (`locationCode`, `formattedAddress`, `lat`,
`lon`, `placeId`). Feed `locationCode` into `startVerification({ locationCode })`.

## SDK API (Track B — imperative)

For custom UIs, server-driven flows, and re-verification. Same `VerifyResult`
shape and the same automatic `collection` wiring as the widget.

| Method | Purpose |
| --- | --- |
| `initialize(config)` / `setUser(user)` | Bootstrap + bind the app user |
| `startVerification({ locationCode })` | Digital verification → `POST /locations/:code/verifications/digital` |
| `startPhysicalVerification({ locationCode, provider })` | Physical-agent visit |
| `startDigitalAndPhysicalVerification({ locationCode, physicalProvider })` | Combined |
| `pauseVerification()` / `resumeVerification()` / `cancelVerification(code)` | Lifecycle |
| `getVerificationState()` / `sync()` / `logout()` / `reset()` | State + teardown |

When to use which: the widget is the fastest integration (SDK-owned UX); the
imperative API is for partners who build their own address UI or re-verify a
saved `locationCode`. See [docs/INTEGRATION-GUIDE.md](docs/INTEGRATION-GUIDE.md).

## Permissions

The SDK owns permission orchestration (contract §0). Probe state with
`getPermissionState()` (returns `foregroundLocation` / `backgroundLocation` /
`notifications`, each `GRANTED | DENIED | NOT_DETERMINED | BLOCKED | UNAVAILABLE`),
drive the OS prompt with `requestPermissions()`, and deep-link to settings with
`openSettings()`. `start*` validates readiness and throws `PERMISSION_DENIED`
before collection begins. Manifest requirements: `ACCESS_FINE_LOCATION`,
`ACCESS_BACKGROUND_LOCATION` (Android), `NSLocation*UsageDescription` +
background location mode (iOS).

## Example app

[`examples/core`](examples/core) is the OkHi-style guided demo (Login →
Verification hub → Collect UI → SDK API verify → Helpers → Addresses → Developer
→ Logout). The shared Maestro happy path lives at
`geo-tagging/apps/e2e/maestro/flows/collect-verify/happy-path.yaml`.

**Run it on a simulator/device** (bare RN — `examples/core`):

```bash
# 0. Build the SDK once so the example's file:../.. link resolves
npm install && npm run build

# 1. Credentials — copy the template, then fill in your keys
cd examples/core
cp src/config/credentials.template.json src/config/credentials.json
#   edit src/config/credentials.json:
#     - apiKey:           tenant key per environment (the `staging`/`local`
#                         entries are pre-seeded with aiq_test_demo_bank_seed01)
#   The map + Street View key is provisioned by the platform (fetched via
#   `/widget/config`) — no integrator-supplied Google Maps key is required.
#   credentials.json is gitignored; the template is the only tracked file.

# 2. Install dependencies + native link
npm install
#   iOS: install CocoaPods. Android needs NO equivalent step — React Native
#   autolinks the SDK's native module through Gradle at build time.
cd ios && pod install && cd ..      # iOS only

# 3. Launch (Metro starts automatically)
npm run ios          # iOS  — boots a Simulator (or a connected device)
npm run android      # Android — needs a running emulator or connected device
```

**iOS prerequisites:** Xcode + CocoaPods (`sudo gem install cocoapods` or `brew install cocoapods`).

**Android prerequisites:** Android Studio (SDK + platform tools) and **JDK 17**. Start an
emulator (Android Studio ▸ Device Manager) or plug in a device with USB debugging,
then `npm run android`. The Android SDK path is read from `$ANDROID_HOME` or
`android/local.properties` — no `pod install`-style step is needed; Gradle autolinks
the SDK. If the build can't find the SDK, create `examples/core/android/local.properties`
with `sdk.dir=/Users/<you>/Library/Android/sdk`.

Pick the environment (`staging` / `development` / `production`) on the **Login**
screen — it selects the API + ingest hosts. Use `development` only when a local
AddressIQ backend is running on `:4000`; otherwise use `staging`.

> **Expo example** (`examples/expo`) needs a **dev build**
> (`npx expo prebuild && npx expo run:ios`), not Expo Go — the SDK ships
> native code that Expo Go can't load.

## Environment

`deployment: 'production' | 'staging' | 'development'` fully determines the
base URLs — there is no URL override; integrators never pass a URL. `staging` is
the canonical name across all AddressIQ SDKs.
`development` targets a local backend on port `:4000` and is emulator-aware (the
Android emulator uses `10.0.2.2` automatically, everything else uses `localhost`).
The `apiKey` is supplied at `initialize()` — never hard-code production keys in
the bundle.

Each environment resolves three hosts — `apiUrl`, `ingestUrl`, and `cdnUrl` —
via `resolveUrls()` (`src/config.ts:70-73`). `production` and `staging` are baked
in at publish time from GitHub repository variables (see
[`docs/RELEASE.md`](docs/RELEASE.md)); `development` is local-only and never baked.

### How the verify widget is loaded

`cdnUrl` is not just config — the verify WebView loads the widget from it, under
a Subresource-Integrity pin. Resolution order (`src/ui/widgetHtml.ts:74-111`):

1. **`widgetUrl`** — explicit developer override, wins over everything.
2. **Pinned CDN build** — `{cdnUrl}/v{BUILD_WIDGET_VERSION}/iqcollect.js` loaded
   with `integrity="{BUILD_WIDGET_INTEGRITY}" crossorigin="anonymous"`
   (`widgetHtml.ts:106`). WKWebView (WebKit) and Android WebView (Chromium) both
   **enforce** `integrity`, so the CDN can only execute the exact bytes hashed at
   build time. The pair is baked into `src/generated/buildConfig.ts` from the
   repo-root `.widget-version` / `.widget-integrity` files, which addressiq-web's
   release fanout writes from the same build the CDN serves; CDN paths are
   immutable (`/v{x.y.z}/`, no floating alias) because a mutable URL cannot be
   SRI-pinned.
3. **Bundled widget** (`WIDGET_JS` in `src/ui/widgetBundle.ts`) — the *fallback*,
   injected by `onerror="__iqWidgetFallback()"`, covering a CDN outage, an
   offline device **and** an SRI mismatch. It is also the only source when the
   CDN path is off (`development`, or an unbaked version/integrity —
   `cdnWidgetEnabled`, `widgetHtml.ts:56-68`).

With neither a pinned CDN build nor the bundle the SDK still **fails closed**
(`WIDGET_BUNDLE_MISSING`, `widgetHtml.ts:110`) — it never loads an unpinned
remote script.

Three details in that markup are load-bearing — each fails *silently* toward
"looks fine, but never actually uses the CDN":

- `crossorigin="anonymous"` is **mandatory**: without it the cross-origin
  response is opaque, `integrity` cannot be evaluated, and every load hard-fails
  into the fallback.
- **Script order**: a blocking classic `<script>` fires `onerror` before the
  parser reaches the next inline script, so `__iqWidgetFallback()` is defined
  *before* the remote tag (which carries no `defer`/`async`).
- The inlined fallback bundle is **escaped** (`scriptSafe`, `widgetHtml.ts:70`)
  — it contains `</script>`-alike sequences that would otherwise terminate the
  tag.

## Errors

Errors are `AddressIQError` instances carrying a stable `code` from the contract
closed set — e.g. `SDK_NOT_INITIALIZED`, `INVALID_USER`, `PERMISSION_DENIED`,
`NO_ACTIVE_SESSION`, the `IDEMPOTENCY_KEY_*` family, and `PROVIDER_*`. Weak
signal quality degrades a verification to `UNKNOWN`, never `FAILED`
(contract §0). Full table: [docs/sdk-contract.md §3](../../geo-tagging/docs/sdk-contract.md).

## Cross-links

- [Cross-SDK contract](../../geo-tagging/docs/sdk-contract.md)
- [Public API reference / Request Digital Verification](https://docs.addressiqpro.com/api-reference/request-digital-verification)
- [docs/INTEGRATION-GUIDE.md](docs/INTEGRATION-GUIDE.md) · [docs/IMPLEMENTATION-SCOPE.md](docs/IMPLEMENTATION-SCOPE.md)

## Integration guide

See [docs/INTEGRATION-GUIDE.md](docs/INTEGRATION-GUIDE.md) and
[docs/IMPLEMENTATION-SCOPE.md](docs/IMPLEMENTATION-SCOPE.md) for:

- OkHi example breakdown and migration map
- **Cross-SDK contract scope** (what must propagate to Flutter/iOS/Android)
- Native setup checklist and essentials coverage matrix
- Error handling patterns and improvement roadmap

The [`examples/core`](examples/core) app is an OkHi-style guided demo: Collect Address → Verify → Helpers → Logout, with a Developer screen for raw APIs.

## Develop

```bash
npm install        # installs deps incl. RN peers for building/type-checking
npm run build      # tsc — compiles + type-checks the full SDK
npm test           # jest smoke test
npm run type-check # tsc --noEmit
```

## Examples against your local SDK

```bash
npm run example:core   # bare RN example — install + type-check
npm run example:expo   # Expo example — install + `expo start`
```

Edits to `src/` are picked up immediately via the `file:../..` symlink. Running
on a device needs the native module autolinked: bare RN uses `pod install` /
Gradle autolink; the Expo example needs a **dev build** (`npx expo prebuild`),
not Expo Go, because the SDK ships native code.

## Release

Push a semver tag to publish to npm (`.github/workflows/release.yml`):

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Requires the `NPM_TOKEN` repository secret. Run the workflow manually with
`dry_run: true` to validate packaging first.

## Contributing

Fork, branch, PR. CI builds the SDK, runs the smoke test, and type-checks both
examples against the local SDK on every push/PR.

## Running the SDK locally, end to end

Everything below is **development-only**. Every override is honoured solely under
the `development` deployment and **throws** on a staging or production build, even
if the variable is set — a build-time value must never be able to point a shipped
app at an arbitrary host.

### 1. Start the backend

```sh
cd addressiq-node-backend
cp .env.example .env          # set GOOGLE_MAPS_API_KEY if you want the map to load
npm install && npm start      # http://localhost:4000
```

It must bind `0.0.0.0`, not `127.0.0.1`, or nothing off-machine can reach it.

### 2. (Optional) Serve the widget yourself

Only needed if you are **changing the widget**. Otherwise the SDK uses the widget
it already ships.

```sh
cd addressiq-web
npx rollup -c                 # → dist/iqcollect.js
npx serve dist -p 5173
```

Then set `ADDRESSIQ_DEV_WIDGET_URL` to `http://<host>:5173/iqcollect.js` for live
reload without re-vendoring. Point it at a **published** URL
(`https://cdn.addressiqpro.com/v0.5.3/iqcollect.js`) instead to exercise the
remote-load + SRI + `onerror`-fallback paths, which `development` otherwise never
takes because it inlines the bundled asset.

A `file://` path will **not** work: the Android emulator is a separate VM and
cannot see your filesystem, and a physical device certainly cannot. It has to be
served over HTTP.

### 3. Point the SDK at your machine

```sh
cp .env.example .env
```

**Which host do I use?**

| Running on | Host |
|---|---|
| Android emulator | `10.0.2.2` — a special alias for your machine's localhost |
| iOS simulator | `localhost` — it shares your Mac's network |
| **Physical device (either OS)** | your **LAN IP** — `ipconfig getifaddr en0` |

The default is the emulator/simulator literal, which is exactly why these
overrides exist: **a physical device cannot reach `10.0.2.2` or `localhost`.**

React Native ships source and has no build step, so `process.env` is undefined at
runtime in a bare app — the **host app** passes the values to `initialize()` from
its own env:

```ts
import Config from "react-native-config";   // or your dotenv setup

initialize({
  apiKey: Config.ADDRESSIQ_API_KEY,
  deployment: "development",
  devApiUrl: Config.ADDRESSIQ_DEV_API_URL,
  devIngestUrl: Config.ADDRESSIQ_DEV_INGEST_URL,
  devCdnUrl: Config.ADDRESSIQ_DEV_CDN_URL,
});
```

### 4. Android only: allow plain HTTP

A LAN IP over plain `http://` is blocked by default. In your **debug** manifest:

```xml
<application android:usesCleartextTraffic="true" …>
```

Debug only — never in a release. (A `network_security_config` scoped to that one
host is the tighter version.)

### Troubleshooting

- **Requests hang / connection refused on a real device** — the backend is bound to
  `127.0.0.1`. Bind `0.0.0.0`.
- **Works on the emulator, fails on a device** — you are still on `10.0.2.2`. Set a
  LAN IP.
- **Android: `net::ERR_CLEARTEXT_NOT_PERMITTED`** — step 4.
- **The map is blank** — your backend has no Maps key. `GET /api/v1/widget/config`
  supplies it; set `GOOGLE_MAPS_API_KEY` in the backend's `.env`. (The key is
  platform-provisioned; no native SDK accepts one, because the key is used by the
  widget, not by native code.)
- **An override "does nothing"** — check `deployment` is `development`. Anywhere
  else it throws rather than being silently ignored, so you would have seen an error.
