/**
 * Smoke test — guards the release pipeline against a broken runtime import.
 * Targets the native-free `errors` module so it runs without an RN runtime;
 * the full export graph is validated by `pnpm build`.
 */
import { AddressIQError, isAddressIQError } from '../src/errors';

describe('@addressiq/react-native runtime surface', () => {
  it('constructs an AddressIQError', () => {
    const err = new AddressIQError('SDK_NOT_INITIALIZED', 'boom');
    expect(err).toBeInstanceOf(Error);
    expect(isAddressIQError(err)).toBe(true);
  });

  it('does not mistake a plain Error for an AddressIQError', () => {
    expect(isAddressIQError(new Error('plain'))).toBe(false);
  });
});
