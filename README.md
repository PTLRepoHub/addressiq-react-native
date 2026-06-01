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
  examples/app/    minimal example, linked to the LOCAL SDK (file: symlink)
```

## Develop

```bash
npm install        # installs deps incl. RN peers for building/type-checking
npm run build      # tsc — compiles + type-checks the full SDK
npm test           # jest smoke test
npm run type-check # tsc --noEmit
```

## Example against your local SDK

```bash
npm run example    # installs examples/app (file:../.. link) + type-checks it
```

`examples/app` depends on `@addressiq/react-native: "file:../.."`, which npm
symlinks to this repo — so edits to `src/` are picked up immediately. The
example's `App.tsx` is a drop-in for your own bare-RN or Expo (dev build) app;
running it on a device requires autolinking the native module (`pod install`
on iOS, Gradle autolink on Android).

## Release

Push a semver tag to publish to npm (`.github/workflows/release.yml`):

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Requires the `NPM_TOKEN` repository secret. Run the workflow manually with
`dry_run: true` to validate packaging first.

## Contributing

Fork, branch, PR. CI builds the SDK, runs the smoke test, and type-checks the
example against the local SDK on every push/PR.
