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

await initialize({ apiKey: 'aiq_live_…', environment: 'production' });
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
  googleMapsApiKey={GOOGLE_MAPS_KEY}     // enables the map flow (see below)
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

When `googleMapsApiKey` is set, the address step uses Google Maps:

- **Current location** or **Places Autocomplete** search to set the point,
- a **draggable map pin** (`react-native-maps`),
- the **formatted address is auto-derived** (reverse geocode / place details) —
  it is read-only, not typed,
- where **Street View coverage** exists (checked via the free metadata endpoint),
  a **Street View pin-confirm** step (`react-native-webview`) captures the pano +
  heading.

`react-native-maps` and `react-native-webview` are **optional** peer
dependencies. Without them (or without a key) the step **degrades gracefully**
to GPS + a manual formatted-address field. Install for the full experience:

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
#     - googleMapsApiKey: enables the map + Street View flow (optional — the
#                         address step degrades to GPS + manual entry without it)
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

Pick the environment (`staging` / `local` / `production`) on the **Login**
screen — it selects the API + ingest hosts. Use `local` only when the
[`geo-tagging`](https://github.com/PTLRepoHub) backend stack is running
(`docker compose up -d && pnpm dev`, API on `:4000`); otherwise use `staging`.

> **Expo example** (`examples/expo`) needs a **dev build**
> (`npx expo prebuild && npx expo run:ios`), not Expo Go — the SDK ships
> native code that Expo Go can't load.

## Environment

`environment: 'production' | 'staging' | 'local'` selects the API + ingest
base URLs (override with `apiUrl` / `ingestUrl`). The `apiKey` is supplied at
`initialize()` — never hard-code production keys in the bundle.

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
