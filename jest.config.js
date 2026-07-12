/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Smoke test targets native-free modules so it runs without an RN runtime.
  // The full export graph is compiled by `npm run build`.
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', types: ['jest'] } }],
  },
  // The tested modules pull in `react-native` (e.g. `Platform` in config.ts).
  // Its ESM entrypoint can't be required in the node test env, so stub the
  // slice we touch. Platform.OS = 'ios' → non-emulator dev host (localhost).
  moduleNameMapper: {
    '^react-native$': '<rootDir>/__mocks__/react-native.js',
  },
};
