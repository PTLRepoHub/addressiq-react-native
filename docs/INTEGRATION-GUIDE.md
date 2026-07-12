# AddressIQ React Native — Integration Guide

This guide documents how the [OkHi `react-native-okhi` example](https://github.com/OkHi/react-native-okhi/tree/master/example) exercises its SDK, how `@addressiq/react-native` compares, and what partners need for a production integration.

Cross-SDK contract reference: [sdk-contract.md](https://github.com/addressiq/geo-tagging/blob/main/docs/sdk-contract.md) in the geo-tagging monorepo.

---

## Quick start

```tsx
import {
  initialize,
  setUser,
  startVerification,
  IQLocationManager,
} from '@addressiq/react-native';

// 1. Bootstrap once at app start
initialize({
  apiKey: 'aiq_test_...',
  environment: 'staging', // 'production' | 'staging' | 'development'
});

// 2. Bind the signed-in customer
await setUser({
  appUserId: customer.id,
  firstName: customer.firstName,
  lastName: customer.lastName,
  email: customer.email,
  phone: customer.phone,
});

// 3a. Imperative digital verification (after you have a locationCode)
const { verificationCode } = await startVerification({
  locationCode: 'loc_abc123',
  digitalProvider: 'internal_ai', // optional
});

// 3b. Or launch the drop-in widget (creates location + verification)
<IQLocationManager
  visible={open}
  apiKey={API_KEY}
  appUserId={customer.id}
  environment="staging"
  onComplete={(r) => console.log(r.verificationCode, r.locationCode)}
  onCancel={() => setOpen(false)}
/>
```

---

## Collect UI vs SDK API — which do I use?

Two entry points, **same outcome**. Both return the public
`verificationCode` + `locationCode`, and both auto-wire background
collection (geofence + telemetry) on success — so you can mix them freely.

| | **Collect UI** (`<IQLocationManager>` / `AddressIQVerify*`) | **SDK API** (`start*`) |
| --- | --- | --- |
| **Use when** | Fastest drop-in, self-serve address capture | Custom UI, server-driven flows, or re-verifying a saved `locationCode` |
| **Who builds the capture UI** | The SDK (rationale + map + form + consent) | You |
| **Needs an existing `locationCode`** | No — it creates the location | Yes — pass one you already have |
| **Returns** | `verificationCode` + `locationCode` via `onComplete` | `verificationCode` + `locationCode` from the promise |
| **Background collection** | Auto-wired on submit | Auto-wired on start |

```
                 Do you already have a locationCode?
                          │
            ┌─────────────┴──────────────┐
           NO                            YES
            │                             │
   Want the SDK to render          Re-verify it digitally
   the capture UI?                 (or physical / combined)
            │                             │
   ┌────────┴────────┐                    ▼
  YES               NO          startVerification({ locationCode })
   │                 │
 Collect UI    Build your own UI,
 widget        then start* with the
               locationCode you minted
```

Typical Collect → Verify path: drop in `<IQLocationManager>`, take the
`locationCode` from `onComplete`, and re-verify later with
`startVerification({ locationCode })` whenever you need a fresh check.

---

## OkHi examples across platforms

OkHi ships a different example style per platform. AddressIQ should mirror the **intent** (guided happy path + optional dev toolbox), not copy each layout literally.

| Platform | OkHi example | What it actually demonstrates |
| --- | --- | --- |
| **React Native** | [react-native-okhi/example](https://github.com/OkHi/react-native-okhi/tree/master/example) | Full multi-screen demo — **best reference for AddressIQ mobile examples** |
| **Flutter** | [flutter-okhi/example](https://github.com/OkHi/flutter-okhi/tree/master/example) | Minimal quick-start in `main.dart`; richer toolbox in `home.dart` is **not wired** |
| **Web / JS** | [js-core/example](https://github.com/OkHi/js-core/tree/master/example) | 15-line Node script for auth token exchange — **not** a browser collect UI |

---

## OkHi React Native example

Reference: [OkHi/react-native-okhi/example](https://github.com/OkHi/react-native-okhi/tree/master/example)

### App flow

```
LoginScreen (form + environment picker)
  → AsyncStorage persistence
  → VerificationScreen (SDK hub)
       → OkHi.login() on mount
       → Digital / Physical / Combined / Create Address / Re-verify saved
       → HelpersScreen (permission probes)
       → AddressesScreen (local history)
       → Logout → LoginScreen
```

### How OkHi uses its SDK

| Pattern | OkHi approach |
| --- | --- |
| **Style** | Imperative `import * as OkHi` — no React Context, no hooks |
| **Auth** | Two-step: app form login (AsyncStorage only) + `OkHi.login()` on hub mount |
| **Credentials** | Gitignored `credentials.json` per environment (`prod` / `sandbox` / `dev`) with `branchId` + `clientKey` |
| **Verification** | Native OkCollect UI launched by `startDigitalAddressVerification()`, `startPhysicalAddressVerification()`, etc. |
| **Results** | Modal JSON viewer for every SDK call (demo/debug oriented) |
| **Address history** | AsyncStorage list of `OkHiLocation` objects |

### OkHi SDK APIs exercised

| API | When |
| --- | --- |
| `login({ auth, user, appContext, configuration })` | Required before any verification — called on VerificationScreen mount |
| `startDigitalAddressVerification(config?)` | Digital-only flow; optional `locationId` to re-verify |
| `startPhysicalAddressVerification(config?)` | Physical agent visit flow |
| `startDigitalAndPhysicalAddressVerification(config?)` | Combined flow |
| `createAddress(config?)` | Address capture without full verification |
| `logout()` | Stops in-flight verifications; returns stopped location IDs |
| 12+ helper methods | `isLocationServicesEnabled`, `requestLocationPermission`, `openProtectedApps`, Play Services checks, etc. |

### OkHi native setup

**iOS** — `OK.startMonitoring()` in `AppDelegate` at launch; `Info.plist` location usage strings + `UIBackgroundModes: location, fetch`.

**Android** — OkHi Maven repository; fine/coarse/background location, notifications, foreground-service permissions; notification metadata for the FGS.

### OkHi RN example gaps (lessons for integrators)

1. `credentials.json` must be created manually (or injected in CI) — the app won't build without it.
2. SDK login errors only `console.error` — no user-facing error UI.
3. Saved `locationId` is held in `useRef` — lost on app restart.
4. Generic error handling — production apps should branch on `OkHiException` codes (`user_closed`, `permission_denied`, etc.).
5. Example `README.md` is the default RN scaffold — OkHi-specific setup lives in the parent package README.

---

## OkHi Flutter example

Reference: [OkHi/flutter-okhi/example](https://github.com/OkHi/flutter-okhi/tree/master/example)

### Two layers in one repo

| File | Status | Flow |
| --- | --- | --- |
| `lib/main.dart` | **Active entry** | `OkHi.initialize()` → embed `OkHiLocationManager` → `onSuccess → response.startVerification()` |
| `lib/screens/home.dart` | **Dormant** (not routed) | Helper API playground + navigate to create/verify screens |

Active flow (minimal):

```
App launch
  → OkHi.initialize(branchId, clientKey, env, androidNotification)
  → OkHiLocationManager(user: OkHiUser(phone: …))
       → WebView OkCollect + internal HTTP sign-in
       → onSuccess → response.startVerification(null)
```

### How Flutter OkHi differs from RN OkHi

| Dimension | Flutter example | RN example |
| --- | --- | --- |
| **Init** | `OkHi.initialize(config)` at startup | `OkHi.login({ auth, user })` on hub mount |
| **Credentials** | Hardcoded in `main.dart` | `credentials.json` per environment |
| **User session** | Phone on widget only | Full login form + AsyncStorage |
| **Address capture** | `OkHiLocationManager` widget (WebView) | `createAddress()` native OkCollect |
| **Verification** | `OkHi.startVerification(user, location)` | `startDigital*` / `startPhysical*` / combined |
| **Example depth** | Quick-start snippet | Full product demo |

### AddressIQ Flutter today

Repo: [addressiq-flutter](https://github.com/PTLRepoHub/addressiq-flutter)

`example/lib/main.dart` is a **lifecycle log** (initialize → setUser → startPhysical → pause/resume) — closer to our RN Developer screen than OkHi's guided flow. It does **not** yet demonstrate `<AddressIQVerify>` widget or the OkHi-style Collect → Verify happy path.

**Target:** port the RN `examples/core` guided flow to Flutter using `AddressIQVerify` + the same screen names (Login → Verification → Helpers → Addresses).

---

## OkHi JS / web example (`js-core`)

Reference: [OkHi/js-core/example](https://github.com/OkHi/js-core/tree/master/example)

### What it is (and is not)

`@okhi/core` is a **server-side auth client**, not a browser collect SDK:

- `example/app.js` — Node script (~15 lines), last updated 2020
- Calls stale APIs (`OkHi.init`, `fetchUserVerificationToken`) — real API is `new OkHiCore({ auth, context })` + `core.user.anonymousSignInWithUserId()`
- **No HTML, no iframe, no address picker, no verification signals**

```
Base64(clientKey:branchId)
  → new OkHiCore({ auth, context })
  → POST /auth/anonymous-signin
  → authorization_token (for embedding OkCollect web elsewhere)
```

Browser address collection in OkHi is a **separate product** (OkCollect web / hosted widget), typically fed tokens minted by `js-core` on your backend.

### AddressIQ web today

Repo: [addressiq-web](https://github.com/PTLRepoHub/addressiq-web) — `@addressiq/iqcollect-web`

Per [sdk-contract.md](https://github.com/addressiq/geo-tagging/blob/main/docs/sdk-contract.md) §1, web is **collect-only**:

| Capability | OkHi js-core | AddressIQ IQCollect |
| --- | --- | --- |
| Mint scoped user token | Yes (server Node) | Widget session via `POST /widget/sessions/create` (partner backend) |
| Browser collect UI | Separate OkCollect web product | `new IQCollect(mount, config)` or hosted iframe widget |
| Verification methods | Token only | **Rejected** — `BROWSER_VERIFICATION_NOT_SUPPORTED` |
| Background geofencing | N/A | N/A — mobile SDK responsibility |

**No `js-core`-style example exists in addressiq-web yet.** The closest analogue is a small Node script that calls `POST /api/v1/widget/sessions/create` and passes the token to IQCollect — not token-for-verify like OkHi.

---

## OkHi → AddressIQ migration map (mobile)

| OkHi API | AddressIQ equivalent | Notes |
| --- | --- | --- |
| `OkHi.login({ auth, user, ... })` | `initialize(config)` + `setUser(user)` | Split bootstrap vs user binding |
| `auth.branchId` + `auth.clientKey` | `apiKey` | Single tenant key per environment |
| `auth.env` (`prod` / `sandbox` / `dev`) | `environment` (`production` / `staging` / `development`) | |
| `startDigitalAddressVerification()` | `startVerification({ locationCode })` | Requires existing `locationCode` |
| `startPhysicalAddressVerification()` | `startPhysicalVerification({ locationCode, provider })` | |
| `startDigitalAndPhysicalAddressVerification()` | `startDigitalAndPhysicalVerification({ locationCode, physicalProvider })` | |
| `createAddress()` / `OkHiLocationManager` | `<IQLocationManager>` / `<AddressIQVerify>` (Flutter) | Widget submit = collect path |
| `logout()` | `logout()` | Pauses collection; best-effort backend session invalidation |
| Helpers screen APIs | `requestPermissions`, `getPermissionState`, `shouldShowRationale`, `openSettings`, `checkDeviceCapabilities` | Fewer OEM-specific helpers |
| Inline verification result | `getVerificationStatus(code)` + `onStatusChange` | Push-driven; SDK does not poll |

---

## Side-by-side comparison

| Dimension | OkHi example | AddressIQ (`@addressiq/react-native`) |
| --- | --- | --- |
| **Init** | `OkHi.login()` — auth + user in one call | `initialize()` then `setUser()` |
| **Address capture** | Native OkCollect UI inside SDK methods | `<IQLocationManager>` widget or partner-owned UI |
| **Digital-only** | `startDigitalAddressVerification()` | `startVerification()` |
| **Physical** | `startPhysicalAddressVerification()` | `startPhysicalVerification()` |
| **Combined** | `startDigitalAndPhysicalAddressVerification()` | `startDigitalAndPhysicalVerification()` |
| **Lifecycle** | Implicit in native flows | Explicit `pauseVerification` / `resumeVerification` / `getVerificationState` |
| **Background collection** | Inside native OkCollect | `startBackgroundPinging()` — auto-wired on verification start |
| **Geofences** | Opaque (native) | `registerGeofence` + auto-register from API response |
| **Telemetry** | Opaque (native) | §5 envelope queue → `POST /v1/transit-events/batch` |
| **Status delivery** | Returned inline from verification methods | `getVerificationStatus` + `onStatusChange` (host dispatches push) |
| **Example depth** | Full multi-screen demo of all APIs | `examples/core` — OkHi-style demo hub |
| **Errors** | `OkHiException` codes | `AddressIQError` with stable `code` field |

### What OkHi does better (integration UX)

1. Comprehensive example app — every public API has a button and visible result.
2. Environment switcher without rebuild.
3. Dedicated permission playground screen.
4. Local address history for re-verify demos.
5. Separated `createAddress` from verification start.

### What AddressIQ does better (platform depth)

1. Explicit lifecycle state machine (`IDLE` → `COLLECTING` → `PAUSED` → `TERMINATED`).
2. Offline telemetry queue with `sync()`.
3. Widget + imperative API — partners choose drop-in UI or headless REST.
4. Cross-SDK behavioral contract shared with Kotlin, Swift, Flutter.
5. TurboModule native bridge with JS fallback for Metro/tests.

---

## Native setup checklist

### Android — `AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
```

For `targetSdkVersion ≥ 34`, declare the foreground-service type on the SDK service (autolinking handles registration).

### iOS — `Info.plist`

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Used to confirm the address you provide.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Used to verify your home address in the background.</string>
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
  <string>fetch</string>
</array>
```

Run `pod install` after adding the package. No manual `AppDelegate` hook is required (unlike OkHi's `OK.startMonitoring()`).

---

## Example app walkthrough

See [`examples/core/`](../examples/core/) and [IMPLEMENTATION-SCOPE.md](./IMPLEMENTATION-SCOPE.md) for what is RN-only vs cross-SDK.

The demo mirrors OkHi's structure with a **guided happy path** on the main screen:

| Screen | Purpose |
| --- | --- |
| **Login** | User profile + environment picker → AsyncStorage |
| **Verification** | Step 1 Collect Address (widget) → Step 2 Digital / Physical / Combined verify |
| **Helpers** | Permission playground (OkHi Helpers screen) |
| **Addresses** | Saved locations + re-verify digitally |
| **Developer** | Raw API names + JSON modals for integrators |
| **Settings** | Logout / reset (OkHi settings sheet) |

### Happy path (no docs required)

1. Login with staging + demo user
2. **Collect Address** → complete widget
3. **Digital Verification** on the saved location
4. **Permission Helpers** to inspect grants
5. Settings → **Logout**

Copy `src/config/credentials.template.json` → `credentials.json` for custom API keys.

```bash
cd examples/core
npm install
npm run ios   # or npm run android
```

---

## Essentials coverage matrix

Status against the [cross-SDK contract](https://github.com/addressiq/geo-tagging/blob/main/docs/sdk-contract.md):

| Essential | Status |
| --- | --- |
| `initialize(config)` | Done |
| `setUser(user)` | Done |
| `startVerification` (digital-only) | Done |
| `startPhysicalVerification` | Done |
| `startDigitalAndPhysicalVerification` | Done |
| `cancelVerification` | Done |
| `pauseVerification` / `resumeVerification` | Done |
| `logout` / `reset` | Done |
| `getVerificationState` | Done |
| `getPermissionState` (5 states) | Done — Android rationale tracking + iOS auth status mapping |
| `requestPermissions` | Done |
| `PERMISSION_DENIED` before verification start | Done |
| Auto background on verification start | Done |
| Widget `onComplete` returns `verificationCode` + `locationCode` (public codes) | Done — fixed; previously parsed `verificationId`/`locationId` and left collection un-wired (P0-1) |
| Backend digital route (`POST /locations/:code/verifications/digital`) | Done — live in geo-tagging `apps/api`; `startVerification` no longer 404s (P0-2) |
| Widget starts background on success | Done — wired via corrected codes |
| Geofence auto-register | Done |
| Theme tokens (32 required) | Done |
| Typed errors (`AddressIQError`) | Done |
| Idempotency keys (`iqidem_rn_*`) | Done |
| Device push registration | Planned (P2) |
| 45-min geofence heartbeat | Planned (P2) |
| `createAddress` headless API | Planned (P2) |
| Full contract E2E harness wired to RN sample | Planned |

---

## Error handling patterns

Always catch `AddressIQError` by `code`:

```tsx
import { AddressIQError, isAddressIQError } from '@addressiq/react-native';

try {
  await startVerification({ locationCode });
} catch (e) {
  if (isAddressIQError(e)) {
    switch (e.code) {
      case 'SDK_NOT_INITIALIZED':
        initialize(config);
        break;
      case 'INVALID_USER':
        await setUser({ appUserId: user.id });
        break;
      case 'PERMISSION_DENIED':
        // Show rationale UI, then requestPermissions()
        break;
      case 'PROVIDER_NOT_FOUND':
      case 'PRODUCT_NOT_SUBSCRIBED':
        // Surface to support / check dashboard config
        break;
      default:
        console.error(e.code, e.message);
    }
  }
}
```

| Code | When |
| --- | --- |
| `SDK_NOT_INITIALIZED` | `initialize()` not called |
| `INVALID_USER` | `setUser()` not called or missing `appUserId` |
| `PERMISSION_DENIED` | Verification started without fg+bg location grants |
| `NO_ACTIVE_SESSION` | `resumeVerification()` with nothing paused |
| `HTTP_ERROR` | API returned non-2xx (see `httpStatus`, `serverPayload`) |

Widget flows surface the same codes via `onError`.

---

## Known gaps & roadmap

### P0 — Contract conformance (implemented in v0.1.x)

- `startVerification` digital-only entry
- Permission gate on all `start*` methods
- Rich `getPermissionState` mapping
- Auto `startBackgroundPinging` after verification start and widget submit
- Correct REST paths (`/api/v1/locations/:locationCode/verifications/*`)

### P1 — Integration experience

- Export `mergeTheme` / `DEFAULT_THEME` publicly
- Optional theme tokens: `logoUrl`, `partnerName`, `privacyPolicyUrl`, `locale`
- Address history + re-verify flow in example app

### P2 — Platform parity

- Device push registration (`POST /api/v1/devices/register`)
- 45-minute geofence heartbeat events
- OkHi-style OEM helpers (`openProtectedApps`, `requestEnableLocationServices`)
- Headless `createAddress` equivalent

### P3 — Docs hygiene (geo-tagging repo)

- Retire stale `@addressiq/expo-react-native-sdk` doc page
- Align `sandbox` vs `staging` environment naming in partner docs

---

## REST API reference (SDK client)

| SDK method | HTTP |
| --- | --- |
| `startVerification` | `POST /api/v1/locations/:locationCode/verifications/digital` |
| `startPhysicalVerification` | `POST /api/v1/locations/:locationCode/verifications/physical` |
| `startDigitalAndPhysicalVerification` | `POST /api/v1/locations/:locationCode/verifications/combined` |
| `getVerificationStatus` | `GET /api/v1/verifications/:verificationCode` |
| `cancelVerification` | `POST /api/v1/verifications/:verificationCode/cancel` |
| `listProviders` | `GET /api/v1/providers` |
| Widget session | `POST /api/v1/widget/sessions/create` |
| Widget submit | `POST /api/v1/widget/submit` |
| Telemetry flush | `POST {ingestUrl}/v1/transit-events/batch` |

All mutating calls send an `Idempotency-Key` header (`iqidem_rn_*` when the SDK generates one).
