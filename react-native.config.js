// Tells React Native CLI autolinking how to find this package's native
// modules. Partners on RN ≥ 0.60 do not need to manually link — adding
// `@addressiq/react-native` to dependencies + `pod install` is enough.
// iOS needs no explicit entry: RN autolinking discovers `AddressIQLocation.podspec`
// at the package root automatically, and the CLI's iOS dependency schema no longer
// accepts a `podspecPath` key (it warns if present).
module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.addressiq.location.AddressIQLocationPackage;',
        packageInstance: 'new AddressIQLocationPackage()',
      },
    },
  },
};
