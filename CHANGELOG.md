# Changelog

## [0.2.0](https://github.com/PTLRepoHub/addressiq-react-native/compare/v0.1.0...v0.2.0) (2026-07-10)


### ⚠ BREAKING CHANGES

* a missing widget bundle now throws instead of silently fetching from a CDN. The `widgetUrl` prop still works as a dev override.

### Features

* AddressIQ core React Native SDK + example + CI/CD ([bdf9788](https://github.com/PTLRepoHub/addressiq-react-native/commit/bdf9788f74451cdb77b18dd7d5a819c675c3814e))
* **examples:** split into examples/core + examples/expo ([d1f3749](https://github.com/PTLRepoHub/addressiq-react-native/commit/d1f3749378204854350c212aa4f4b011a1df5f30))
* fail closed when the bundled widget is missing ([1672544](https://github.com/PTLRepoHub/addressiq-react-native/commit/1672544b48b0008ffa2989ddb093ef62466183bb))
* **proto:** generate wire-contract bindings from AddressIq-proto ([dd4fb3c](https://github.com/PTLRepoHub/addressiq-react-native/commit/dd4fb3cf60a0ff6beadb6884a3ed5c978d9eeb9e))
* **rn:** collect→verify split + example demoing all 3 verification types ([646bee2](https://github.com/PTLRepoHub/addressiq-react-native/commit/646bee288da16ed0fd452f336766229c85a6284f))
* **rn:** Google Maps address capture in Collect UI ([c9bb11c](https://github.com/PTLRepoHub/addressiq-react-native/commit/c9bb11cb46b3d8101d1de5e151a1920430f73f15))


### Bug Fixes

* **ci:** set bump-minor-pre-major in release-please config ([f9cdbfa](https://github.com/PTLRepoHub/addressiq-react-native/commit/f9cdbfa91c39ebca60f7d9c96efe0ce570f5f27e))
* **deps:** pin react-native-maps to the 1.20.x line in examples/core ([3e53521](https://github.com/PTLRepoHub/addressiq-react-native/commit/3e535219959d0d7bd7385bdc9820a8d72bfbdb93))
* **podspec:** correct the source repository URL ([a979697](https://github.com/PTLRepoHub/addressiq-react-native/commit/a97969729e8f40614e9cbececd694b614eeaaeb8))
* **types:** pin react-native-webview as a devDependency ([dc5406a](https://github.com/PTLRepoHub/addressiq-react-native/commit/dc5406aa9a4a4122b24b3242289de7ff3aaf4cfb))
