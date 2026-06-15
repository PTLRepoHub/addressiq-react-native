/**
 * Generates a unique idempotency key for a mutating request. The backend
 * requires an `Idempotency-Key` header on every POST that creates state
 * (verifications, widget sessions); replaying the same key is a safe no-op.
 *
 * The `iqidem_rn_` prefix is the React Native platform marker per the
 * cross-SDK contract (`iqidem_<platform>_*`).
 */
export function makeIdempotencyKey(scope: string): string {
  return `iqidem_rn_${scope}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
