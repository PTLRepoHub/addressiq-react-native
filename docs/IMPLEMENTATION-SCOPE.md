# Implementation Scope — RN SDK vs Cross-SDK Contract

This document scopes what belongs in `@addressiq/react-native` alone, what must stay aligned across **all** AddressIQ SDKs (RN, Flutter, iOS, Android), and what the OkHi-style example should demonstrate.

**Contract source of truth:** [geo-tagging/docs/sdk-contract.md](https://github.com/addressiq/geo-tagging/blob/main/docs/sdk-contract.md)

**Sibling SDK repos:** [geo-tagging/docs/sdk-repos.md](https://github.com/addressiq/geo-tagging/blob/main/docs/sdk-repos.md)

---

## Rule: contract changes propagate everywhere

If a behavior is defined in `sdk-contract.md` §0–§5, changing it in React Native **requires** the same semantics in Flutter, iOS, and Android before calling the family conformant. The RN repo can ship first, but geo-tagging's contract E2E suite (`apps/e2e/test/sdk-contract.spec.ts`) is the gate.

| Layer | RN-only OK? | Examples |
| --- | --- | --- |
| Example app UI / navigation | Yes | React Navigation vs state router, card layout, dev prefills |
| TurboModule / platform permission mapping | Yes (idiomatic) | iOS `CLAuthorizationStatus` vs Android `PermissionsAndroid` |
| Public method signatures + lifecycle semantics | **No** | `startVerification`, `PERMISSION_DENIED`, `pauseVerification` |
| REST paths + idempotency key shape | **No** | `iqidem_rn_*` vs `iqidem_android_*` — prefix rule shared |
| Telemetry envelope fields | **No** | §5 batch event shape |
| Widget theme token set | **No** | §1.5 `AddressIQTheme` — same 32 required tokens |

---

## Todo status mapped to scope

| Plan todo | RN status | Cross-SDK impact | Backend dependency |
| --- | --- | --- | --- |
| INTEGRATION-GUIDE.md | Done | Docs only — link from geo-tagging `react-native-core.md` | None |
| README link | Done | RN repo only | None |
| P0: `startVerification` | Done in RN | **Must mirror** in Flutter/iOS/Android repos | `POST …/verifications/digital` — **not implemented in geo-tagging API yet**; widget submit is the live digital path today |
| P0: `PERMISSION_DENIED` gate | Done in RN | **Must mirror** — §0 Permission Trigger Ownership | None |
| P0: `getPermissionState` richness | Done in RN | **Must mirror** — §4 `getPermissionState()` | None |
| P0: auto background collection | Done in RN (`collection.ts`) | **Must mirror** — same postcondition after `start*` + widget success | None |
| P0: REST path fix | Done in RN | **Must mirror** — all SDKs use nested location routes | Endpoints exist for physical/combined |
| OkHi-style example | **RN done** (guided Verification screen) | **Each SDK repo** needs its own sample per contract §6 | Widget flow works against staging seed key |
| P1: export `mergeTheme` | **Done in RN** | **Should mirror** — §1.5 on Flutter/web widget SDKs | None |
| P2: push registration, heartbeat, OEM helpers | Pending | **Must mirror** when added | Device register endpoint TBD |
| P2: headless `createAddress` | Pending | **Contract discussion** — OkHi has it; AddressIQ uses widget submit today | Widget API is the canonical collect path |

---

## What the RN SDK implements today

### In contract (§1 public surface)

| Method | Implemented | Notes |
| --- | --- | --- |
| `initialize` / `setUser` | Yes | |
| `startVerification` | Yes | Blocked until backend ships digital route |
| `startPhysicalVerification` | Yes | |
| `startDigitalAndPhysicalVerification` | Yes | Maps combined response → digital `verificationCode` for collection session |
| `cancelVerification` | Yes | |
| `pauseVerification` / `resumeVerification` | Yes | |
| `logout` / `reset` | Yes | |
| `getVerificationState` | Yes | |
| `getPermissionState` | Yes | Android rationale + iOS auth status |
| `listProviders` | Yes | |
| `sync` | Yes | Telemetry flush |

### RN-specific extras (not in §1 — OK to differ)

- `startBackgroundPinging` / `stopBackgroundPinging` / `onLocationUpdate`
- `registerGeofence` / `onGeofenceTransition`
- `getCurrentLocation` / `checkDeviceCapabilities` / `shouldShowRationale` / `openSettings`
- `isNativeLinked`
- `<IQLocationManager>` widget

These support the contract lifecycle but are exposed imperatively on RN for integrators who skip the widget. Other platforms may fold them into internal collection helpers.

### Collection wiring (`src/collection.ts`)

Shared post-start behavior — **this is the pattern other SDKs should copy**:

1. `telemetry.setSession(locationCode, verificationCode)`
2. Register geofence when API returns coordinates
3. Start OS background collection
4. Flush telemetry queue

Called from imperative `start*` methods and widget submit success.

---

## OkHi example vs AddressIQ example — intent

OkHi optimizes for **integrator confidence**: a partner opens the app, taps obvious flows, sees JSON results, and understands what the SDK does without reading docs.

| OkHi pattern | AddressIQ equivalent | Example should show |
| --- | --- | --- |
| Login + env picker | Login + `environment` + `apiKey` | Yes |
| `OkHi.login()` on hub mount | `initialize` + `setUser` | Yes — silent init, status chip not modal |
| "Digital Verification" button | `startVerification` **or** widget first | Widget = "Collect Address"; digital = "Verify Address" on saved location |
| `createAddress` | `<IQLocationManager>` | Primary CTA |
| Re-verify saved | `startVerification({ locationCode })` | Tap address card → hub pre-fills |
| Helpers screen | Permission playground | Yes |
| Address history | AsyncStorage | Yes with cards |
| Settings → logout | Logout sheet | Yes |
| JSON result modal | Result modal | Yes |
| Raw API names on buttons | **Avoid** — use human labels | Developer screen for raw API names |

### Happy path the example must demonstrate (no docs required)

```
1. Login (staging, demo user)
2. Tap "Collect Address" → IQLocationManager → success
3. Tap "Verify Digitally" on saved address
4. Open Helpers → check permissions
5. Settings → Logout
```

Advanced/lifecycle APIs live on a **Developer** screen so the main hub stays intuitive.

---

## Cross-platform example canon (OkHi-informed)

Contract §6 requires each SDK to ship a sample exercising the **full lifecycle**. OkHi's quality bar differs by platform — AddressIQ should standardize on one **canonical happy path** across mobile SDKs:

```
Login (env + user)
  → Collect Address (widget)
  → Verify (digital / physical / combined)
  → Helpers (permissions)
  → Saved addresses + re-verify
  → Logout
```

| SDK repo | Current example | OkHi reference | Target |
| --- | --- | --- | --- |
| **addressiq-react-native** | `examples/core` — guided Verification screen | [RN example](https://github.com/OkHi/react-native-okhi/tree/master/example) | Done (reference implementation) |
| **addressiq-flutter** | `example/lib/main.dart` — lifecycle log only | [Flutter example](https://github.com/OkHi/flutter-okhi/tree/master/example) main.dart + home.dart patterns | Port RN guided flow; wire `AddressIQVerify` |
| **addressiq-ios / android** | TBD in those repos | RN example (richest) | Same screen flow, native UI |
| **addressiq-web** | No example app | [js-core](https://github.com/OkHi/js-core/tree/master/example) is **not** the model — use IQCollect mount demo | HTML page + optional Node session-minter script |

### Flutter-specific note

OkHi Flutter's active `main.dart` is a **5-line integration** (initialize + widget + auto-verify). Our RN example is **richer than OkHi Flutter's shipped entry point** — that is intentional. OkHi's dormant `home.dart` is the better Flutter analogue for helper APIs; we fold that into Helpers + Developer screens.

### Web-specific note

Do **not** model AddressIQ web on `js-core/example`. IQCollect is collect-only; verification belongs on mobile. Partner pattern:

1. Partner backend: `POST /api/v1/widget/sessions/create` (like OkHi's server token mint)
2. Browser: `IQCollect` mounts and returns `locationId`
3. Mobile SDK: `startVerification({ locationCode })` on the captured location

---

## Out of scope for this RN pass

- Implementing `POST …/verifications/digital` in geo-tagging API (backend team)
- Flutter/iOS/Android parity PRs (separate repos — track as contract conformance work)
- Contract E2E harness wiring to RN sample (geo-tagging `apps/e2e`)
- P2 push registration, geofence heartbeat, OEM battery helpers
- Renaming `staging` → `sandbox` in types (breaking change — needs contract + all SDKs)

---

## Recommended next PRs (ordered)

1. **RN example polish** (this repo only) — OkHi UX, guided happy path, Developer screen
2. **Export `mergeTheme` / `DEFAULT_THEME`** from `src/index.ts` (all widget SDKs)
3. **geo-tagging:** implement `POST /api/v1/locations/:code/verifications/digital`
4. **Cross-SDK:** port P0 behaviors to Flutter, iOS, Android with contract tests
5. **geo-tagging docs:** link `react-native-core.md` → `INTEGRATION-GUIDE.md`; retire Expo doc page
