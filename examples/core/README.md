# AddressIQ React Native — Sample App (bare workflow)

A small React Native app that exercises the AddressIQ SDK end to end: log in, open
the address widget, and start a verification.

The UI is the shared AddressIQ **web widget** hosted in a `react-native-webview`.
This app supplies only what a webview can't: location permission and the API
config, and it reads back the result. It links the local SDK via `file:../..`, so
your SDK changes show up here after a reinstall / Metro restart.

> Bare (non-Expo) app — it needs a native dev build. **Expo Go will not work.**

---

## 1. Prerequisites

- **Node** 18+ and **npm**, **Watchman** (`brew install watchman`)
- **A running AddressIQ backend** on `http://localhost:4000` (see §2). The
  widget/verification calls fail without it.
- **Android**: Android Studio + SDK, and an **AVD** (emulator). JDK 17.
- **iOS** (macOS only): **Xcode** + command-line tools, and **CocoaPods**
  (`sudo gem install cocoapods`).

Install JS deps once:

```bash
cd addressiq-react-native/examples/core
npm install
```

---

## 2. Start the backend

Selecting the `development` environment points the SDK at a local backend on
`:4000`. Bring one up, e.g. the sample Node server:

```bash
cd addressiq-node-backend
node server.js                # listens on :4000
# …or fully offline with canned data:
MOCK_UPSTREAM=1 node server.js
```

The host is resolved automatically from the environment — there is **no**
`apiUrl` to set. The Android emulator reaches the host via `10.0.2.2` and the
iOS simulator via `localhost`; the SDK picks the right one for you.

---

## 3. Configure — `src/config/credentials.json`

Keyed by environment (`production` / `staging` / `development`):

```jsonc
"development": {
  "apiKey": "aiq_test_demo_bank_seed01",   // test key for the demo org
  "businessName": "Kuda Business"           // fallback only — see below
}
```

- **The API host is NOT configured here** — pick `development` on the Login
  screen and the SDK resolves the emulator-aware `:4000` loopback automatically
  (`10.0.2.2` on the Android emulator, `localhost` on iOS). On a **real device**,
  run the SDK against a reachable backend via the `staging`/`production` hosts.
- **The address map key** (Places autocomplete + Street View) is **provisioned by
  the platform** and fetched by the widget via `/widget/config` — you do **not**
  set a Google Maps key in `credentials.json`. If the platform has no
  valid map key configured, the map step shows *"Oops! Something went wrong"* (see
  Troubleshooting).
- **`businessName`** — a **fallback only**. Branding (name, logo, colours, button
  style, corner radius) normally comes from the backend via `/widget/config`,
  configured in the dashboard under **Settings → Branding → Widget**.

---

## 4. Run it

Start (or reuse) Metro, then build to a device/emulator:

### Android

```bash
# 1. boot an emulator (or plug in a device)
emulator -avd <YourAVD> -gpu host -no-snapshot-load &
adb wait-for-device

# 2. build + install + launch (starts Metro if not running)
npx react-native run-android
```

### iOS (macOS)

```bash
# first time, or after changing native deps:
cd ios && pod install && cd ..

npx react-native run-ios --simulator="iPhone 17 Pro"
```

The app opens on a **login screen**: pick the environment, confirm the API key /
app-user id, then **Log in** → the Hub screen with *Collect Address* and the
verification actions.

---

## 5. Working on the SDK or the web widget

Because the SDK is linked from source (`main: src/index.ts`), edits to
`addressiq-react-native/src/**` are picked up by Metro — **but Metro caches the
symlinked module graph**, so after changing SDK files you must restart it with a
cache reset:

```bash
# kill the running packager, then:
npx react-native start --reset-cache
# then reload the app (run-android / run-ios again, or press R twice)
```

The widget UI is the **web** widget, embedded as a string in
`src/ui/widgetBundle.ts`. After changing `addressiq-web`, rebuild and re-embed:

```bash
cd addressiq-web && npx rollup -c          # → dist/iqcollect.js
# re-embed into the SDKs (RN string wrapper + iOS/Android/Flutter assets):
node -e '
const fs=require("fs"); const js=fs.readFileSync("dist/iqcollect.js","utf8");
const h="/* AUTO-GENERATED from @addressiq/iqcollect-web dist/iqcollect.js — do not edit. */\n/* eslint-disable */\n";
fs.writeFileSync("../addressiq-react-native/src/ui/widgetBundle.ts", h+"export const WIDGET_JS: string = "+JSON.stringify(js)+";\n");
for (const p of ["../addressiq-android/src/main/assets/iqcollect.js","../addressiq-flutter/assets/iqcollect.js","../addressiq-ios/Sources/AddressIQ/Resources/iqcollect.js"]) fs.writeFileSync(p, js);
'
```

Then restart Metro with `--reset-cache` and reload.

---

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| **"Network request failed"** on a verification | The app can't reach the backend. In `development` the SDK targets `10.0.2.2:4000` on the Android emulator and `localhost:4000` on iOS (chosen automatically). Make sure a backend is up on `:4000`. |
| **Red screen / "Invalid hook call" / "more than one copy of React" / `useContext` of null** | Stale Metro/dev state after dependency or SDK changes. Restart the packager with `--reset-cache` and reload. |
| **Map: "Oops! Something went wrong… Google Maps"** | The platform has no valid map key configured. The key is provisioned by the platform and served to the widget via `/widget/config` — configure it on the backend (it must have the **Maps JavaScript API** enabled). Integrators do **not** set a key in `credentials.json`. |
| **`No connected devices!` mid-build (Android)** | The emulator crashed/disconnected (often under memory pressure). Relaunch the AVD (`emulator -avd … -no-snapshot-load`), confirm `adb devices`, then re-run. |
| **Widget branding doesn't reflect dashboard changes** | The widget fetches `/widget/config` **on each open** — close and reopen it. Also ensure you saved under **Settings → Branding → Widget** (persists to `settings.widget`). |
| **iOS: focusing an input zooms the page** | Fixed — widget inputs are `font-size: 16px` and the native webview sets `maximum-scale=1`. If you see it again, you're on a stale bundle; rebuild the widget (§5) and reset Metro. |
| **Metro not picking up JS/SDK edits** | Symlinked-SDK cache. `npx react-native start --reset-cache`. |

---

## Related: the native iOS SDK sample

`addressiq-ios/example` is a **separate** SwiftUI app that demonstrates the
**native iOS SDK** (not this RN app). It's a SwiftPM executable — open its
`Package.swift` in Xcode and Run (see its own README). It uses a distinct product
name (`AddressIQSample`, bundle id `com.addressiq.sample`) from this RN example
(`AddressIQCore`, `org.reactjs.native.example.AddressIQCore`), so the two **do not
collide** — both can be installed on the same simulator at once.
