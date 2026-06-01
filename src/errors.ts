/**
 * Typed error surface for `@addressiq/react-native`.
 *
 * Matches the cross-SDK contract (docs/sdk-contract.md §3): every error
 * carries a stable `code` string drawn from the closed set below, so
 * partners can pattern-match without parsing message text.
 *
 *   try {
 *     await startPhysical(args);
 *   } catch (e) {
 *     if (e instanceof AddressIQError && e.code === 'SDK_NOT_INITIALIZED') {
 *       // call initialize() first
 *     }
 *   }
 */

/** Closed set of error codes — must stay in sync with docs/sdk-contract.md §3. */
export type AddressIQErrorCode =
  | 'SDK_NOT_INITIALIZED'
  | 'INVALID_CONFIG'
  | 'INVALID_USER'
  | 'NO_ACTIVE_SESSION'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_DISABLED_FOR_ORG'
  | 'PROVIDER_TYPE_MISMATCH'
  | 'PRODUCT_NOT_SUBSCRIBED'
  | 'PHOTO_HASH_REUSED'
  | 'VERIFICATION_ILLEGAL_TRANSITION'
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'PERMISSION_DENIED'
  | 'ARGS_INVALID';

export class AddressIQError extends Error {
  /** Stable code from the cross-SDK contract. */
  readonly code: AddressIQErrorCode;
  /** HTTP status when the error originated server-side. */
  readonly httpStatus?: number;
  /** Raw server payload for diagnostics. */
  readonly serverPayload?: unknown;

  constructor(
    code: AddressIQErrorCode,
    message: string,
    options: { httpStatus?: number; serverPayload?: unknown; cause?: unknown } = {},
  ) {
    super(`[AddressIQ:${code}] ${message}`);
    this.name = 'AddressIQError';
    this.code = code;
    this.httpStatus = options.httpStatus;
    this.serverPayload = options.serverPayload;
    // Preserve native stack on Hermes / V8 while keeping the prototype chain intact.
    if (typeof (Error as unknown as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      (Error as unknown as { captureStackTrace: (t: object, c: unknown) => void }).captureStackTrace(this, AddressIQError);
    }
    Object.setPrototypeOf(this, AddressIQError.prototype);
  }
}

/** Type guard for partners who use `code in ['…']` style narrowing. */
export function isAddressIQError(value: unknown): value is AddressIQError {
  return value instanceof AddressIQError;
}
