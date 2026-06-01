// Tells React Native CLI autolinking how to find this package's native
// modules. Partners on RN ≥ 0.60 do not need to manually link — adding
// `@addressiq/react-native` to dependencies + `pod install` is enough.
module.exports = {
  dependency: {
    platforms: {
      ios: {
        podspecPath: require('path').resolve(__dirname, 'AddressIQLocation.podspec'),
      },
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.addressiq.location.AddressIQLocationPackage;',
        packageInstance: 'new AddressIQLocationPackage()',
      },
    },
  },
};
