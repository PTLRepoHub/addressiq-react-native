import { BUILD_SDK_VERSION } from '../src/generated/buildConfig';

/**
 * The SDK version header was hardcoded `'0.1.0'` in api.ts and stayed there
 * from the first release through 0.10.0, so every request misreported the
 * version and support could not tell releases apart. It is now baked from
 * package.json by scripts/bake-build-config.sh.
 */
describe('SDK version', () => {
  it('is baked from package.json, not hardcoded', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../package.json') as { version: string };
    expect(BUILD_SDK_VERSION).toBe(pkg.version);
    expect(BUILD_SDK_VERSION).not.toBe('0.1.0');
  });

  it('is not left empty by the baker', () => {
    expect(BUILD_SDK_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
