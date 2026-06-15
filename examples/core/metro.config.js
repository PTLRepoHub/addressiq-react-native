const path = require('path');
const exclusionList = require('metro-config/src/defaults/exclusionList');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// The example consumes the local SDK via `file:../..`, which symlinks the SDK
// root into node_modules. Metro must watch that real path (it lives outside
// this example dir) so edits to `src/` are picked up.
const sdkRoot = path.resolve(__dirname, '../..');
const escaped = sdkRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  // Watch the real SDK source so edits to `src/` are picked up.
  watchFolders: [sdkRoot],
  resolver: {
    // The SDK is a library repo, so it ships its own `react` / `react-native`.
    // Pulling those into the graph alongside the example's copies yields two
    // Reacts — "Invalid hook call / Cannot read property 'useState' of null".
    // Block the SDK's nested copies and force every `react` / `react-native`
    // import (from both the app and the SDK) to this example's single instance.
    blockList: exclusionList([
      new RegExp(`${escaped}/node_modules/react/.*`),
      new RegExp(`${escaped}/node_modules/react-native/.*`),
    ]),
    extraNodeModules: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
