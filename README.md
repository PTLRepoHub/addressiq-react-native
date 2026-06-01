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
