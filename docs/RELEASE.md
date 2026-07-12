# Releasing `@addressiq/react-native`

How this repo cuts a release. Versioning and tagging are automated by
release-please — read the "Before releasing" checklist before merging a release PR.

## What this repo publishes

| Artifact | Registry | Notes |
|---|---|---|
| `@addressiq/react-native` | npm | Published by `.github/workflows/release.yml` |
| `AddressIQLocation` (pod) | CocoaPods | Podspec ships in the npm package (`package.json:16`); the pod reads its version from `package.json` (`AddressIQLocation.podspec:6`) |

The npm package files list is in `package.json:11-18` and includes
`AddressIQLocation.podspec`. Package access is public (`package.json:5-7`,
and `--access public` in `release.yml:42,44`).

> Note: `release.yml` today publishes **only to npm**. There is no automated
> `pod trunk push` step, so a CocoaPods release is currently a manual
> `pod trunk push` after the tag exists. See `RELEASE-ENGINEERING.md:153-155`.

## Release flow (automated — do not tag by hand)

1. Land Conventional Commits on `main` (`fix:`, `feat:`, `feat!:`).
2. `release-please.yml` (runs on `push: [main]`, `release-please.yml:13-16`)
   maintains a **`chore: release X.Y.Z`** PR
   (title pattern in `release-please-config.json:5`).
3. Merging that PR writes `CHANGELOG.md`, bumps `package.json` version, and
   pushes tag **`vX.Y.Z`** (see `release-please.yml:3-9`).
4. The tag push triggers `release.yml` (`release.yml:8-10`, `on: push: tags: v*.*.*`),
   which builds, tests, sets the version from the tag, and runs `npm publish`.

**Never create or push a `vX.Y.Z` tag manually.** The tag is produced by merging
the release-please PR. A manually pushed tag would bypass the changelog/version
bump and can publish an inconsistent version.

Manual escape hatch: `release.yml` also supports `workflow_dispatch` with a
`dry_run` input that defaults to `true` (`release.yml:11-16`), which validates
packaging and publishes nothing.

## Auth / secrets

| Secret | Used by | Purpose |
|---|---|---|
| `ADDRESSIQ_BOT_APP_ID` | `release-please.yml:33` | GitHub App id — mints an App token |
| `ADDRESSIQ_BOT_PRIVATE_KEY` | `release-please.yml:34` | GitHub App private key |
| `NPM_TOKEN` | `release.yml:33` | npm automation token (`NODE_AUTH_TOKEN`) for publish |

Why the GitHub App? GitHub does not fire workflows for events created with the
default `GITHUB_TOKEN` (loop prevention). release-please mints an App token via
`actions/create-github-app-token@v1` (`release-please.yml:29-34`) and hands it to
`googleapis/release-please-action@v4` (`release-please.yml:36-38`), so the
App-authored tag push **does** trigger `release.yml`. See
`RELEASE-ENGINEERING.md:88-94`.

There is **no `COCOAPODS_TRUNK_TOKEN`** in `release.yml`. If/when CocoaPods
publishing is automated, that secret would be added (see
`RELEASE-ENGINEERING.md:153-154`).

## Build configuration (baked at publish time)

`src/generated/buildConfig.ts` is **generated** — never hand-edit it.
`scripts/bake-build-config.sh` rewrites it wholesale from six GitHub
**repository variables** (`vars.*`, not secrets — their values are meant to ship
in the package), three URLs for each shippable environment:

| | staging | production |
|---|---|---|
| API | `STAGING_ADDRESSIQ_API_BASE_URL` | `PROD_ADDRESSIQ_API_BASE_URL` |
| Ingest | `STAGING_ADDRESSIQ_INGEST_BASE_URL` | `PROD_ADDRESSIQ_INGEST_BASE_URL` |
| CDN | `STAGING_ADDRESSIQ_CDN_BASE_URL` | `PROD_ADDRESSIQ_CDN_BASE_URL` |

These replace the old single-environment `ADDRESSIQ_API_URL` /
`ADDRESSIQ_INGEST_URL` pair: staging used to be a hardcoded literal and no CDN
host was baked at all. The file is committed and shipped because RN distributes
source — there is no later build step on the integrator's machine that could
inject these.

`development` is deliberately **not** baked — it points at the host machine's
backend and stays the emulator-aware `DEV_HOST` literal in `src/config.ts:19`.

> ⚠ **Behaviour change — a misconfigured release now fails.** The old release
> step `sed`'d each key and printed *"unset — keeping checked-in default"*, so a
> release with a missing variable published a package pointing at whatever was
> committed, silently. `release.yml:28-37` now runs the baker with `--strict`,
> which **hard-fails** the release if *any* of the six variables is unset
> (`scripts/bake-build-config.sh:59-63`). **All six must be set as repository
> variables before the next release.**

Locally (and in CI outside release), running the script without `--strict` falls
back to the checked-in safe public defaults
(`scripts/bake-build-config.sh:31-38`), so `npm run build` and the test suite
resolve real hosts with no substitution:

```bash
scripts/bake-build-config.sh            # local — unset vars keep their defaults
scripts/bake-build-config.sh --strict   # what release.yml runs
```

Set the variables with:

```bash
gh variable set STAGING_ADDRESSIQ_API_BASE_URL --repo PTLRepoHub/addressiq-react-native --body https://…
# …and the other five.
```

## Versioning rules

Config: `release-please-config.json` — `release-type: node`
(`release-please-config.json:8`) with `bump-minor-pre-major: true`
(`release-please-config.json:10`). Current version is `0.2.0`
(`package.json:3`, `.release-please-manifest.json:2`) — i.e. pre-1.0.

| Commit | Bump (while pre-1.0) |
|---|---|
| `fix:` | patch (`0.2.0` → `0.2.1`) |
| `feat:` | minor (`0.2.0` → `0.3.0`) |
| `feat!:` / `BREAKING CHANGE` | minor, **not** major, because `bump-minor-pre-major` is on |

Tags stay `vX.Y.Z` with no component prefix
(`include-component-in-tag: false`, `release-please-config.json:3`), matching
the `v*.*.*` trigger in `release.yml:10`.

release-please derives both the version bump and the changelog **only** from
commit messages — commits that aren't Conventional Commits produce no release.

## Before releasing (checklist)

- [ ] **Podspec source URL** points at the real remote
      `https://github.com/PTLRepoHub/addressiq-react-native.git`
      (`AddressIQLocation.podspec:13`). This is correct in the current file;
      confirm it has not regressed to `addressiq/sdk-react-native.git`, which
      would make a CocoaPods consumer fail to fetch the tag
      (`RELEASE-ENGINEERING.md:34`, `RELEASE-ENGINEERING.md:240`).
- [ ] **`npm run type-check` is green.** It has been red on `main`
      (`RELEASE-ENGINEERING.md:280-289`): `react-native-webview` was only a
      peerDependency so `tsc` could not resolve its types. Fix pins
      `react-native-webview@13.16.1` as a devDependency (`package.json:52`).
      Verify `npm run type-check` (`package.json:24`) passes before merging a
      release PR.
- [ ] **All six build variables are set** (see *Build configuration* above).
      The bake step runs with `--strict`, so a missing one fails the release:
      `gh variable list --repo PTLRepoHub/addressiq-react-native`.
- [ ] Confirm the release-please PR title is `chore: release X.Y.Z` and the
      version bump matches the merged commit types.

## Local validation

```bash
# npm packaging — publishes nothing
npm install
npm run build           # tsc (package.json:20)
npm test                # jest (package.json:22)
npm run type-check      # must be clean (package.json:24)
npm publish --access public --dry-run

# CocoaPods podspec — full lint clones the tag, so run against a real tag
pod lib lint AddressIQLocation.podspec
```

You can also run `release.yml` via `workflow_dispatch` with `dry_run: true`
(the default) to validate the CI publish path without releasing.
