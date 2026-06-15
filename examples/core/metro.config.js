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
      // The Collect UI map flow's optional native deps are installed in THIS
      // example, not in the symlinked SDK. Map them so the SDK's
      // `require('react-native-maps')` / `react-native-webview` resolve instead
      // of being dropped as unresolved-optional ("Requiring unknown module undefined").
      'react-native-maps': path.resolve(__dirname, 'node_modules/react-native-maps'),
      'react-native-webview': path.resolve(__dirname, 'node_modules/react-native-webview'),
      // Same reason for the Collect UI icon font: the SDK's
      // `require('react-native-vector-icons/Ionicons')` must resolve to the copy
      // installed here, else icons fall back to (colourful) Unicode glyphs.
      'react-native-vector-icons': path.resolve(__dirname, 'node_modules/react-native-vector-icons'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
