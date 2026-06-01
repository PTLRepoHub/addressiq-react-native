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
};
