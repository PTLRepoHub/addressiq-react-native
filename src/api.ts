import { getConfig, resolveUrls } from './config';
import { AddressIQError, type AddressIQErrorCode } from './errors';
import type { VerificationResult } from './types';

/**
 * Thin REST client over the AddressIQ public API. Mirrors the surface
 * the Expo SDK uses so the two packages stay behaviorally identical.
 */

export interface StartPhysicalArgs {
  locationCode: string;
  provider: string;
  idempotencyKey: string;
  appointmentSlot?: string;
}

export interface StartPhysicalResult {
  verificationCode: string;
  status: string;
  scheduledFor?: string;
  /**
   * Adaptive geofence the SDK should monitor while the verification is
   * in flight. Populated when the backend has resolved an address centre
   * + radius for the location; the SDK auto-registers it.
   */
  geofence?: {
    lat: number;
    lon: number;
    radiusM: number;
  };
}

export interface StartCombinedArgs {
  locationCode: string;
  digitalProvider?: string;
  physicalProvider: string;
  idempotencyKey: string;
}

export interface StartCombinedResult {
  verificationCode: string;
  status: string;
  digitalVerificationCode: string;
  physicalVerificationCode: string;
  combinedVerificationId?: string;
  /** See `StartPhysicalResult.geofence`. */
  geofence?: {
    lat: number;
    lon: number;
    radiusM: number;
  };
}

export interface StartVerificationArgs {
  locationCode: string;
  digitalProvider?: string;
  idempotencyKey: string;
}

export interface StartVerificationResult {
  verificationCode: string;
  status: string;
  geofence?: {
    lat: number;
    lon: number;
    radiusM: number;
  };
}

export interface ProviderEntry {
  slug: string;
  displayName: string;
  type: 'digital' | 'physical';
}

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const cfg = getConfig();
  return {
    'Content-Type': 'application/json',
    'x-api-key': cfg.apiKey,
    'x-sdk-name': '@addressiq/react-native',
    'x-sdk-version': '0.1.0',
    ...extra,
  };
}

/** Stable server codes that map 1:1 to our typed error codes. */
const SERVER_CODE_MAP: Record<string, AddressIQErrorCode> = {
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_INVALID: 'IDEMPOTENCY_KEY_INVALID',
  IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  PROVIDER_DISABLED_FOR_ORG: 'PROVIDER_DISABLED_FOR_ORG',
  PROVIDER_TYPE_MISMATCH: 'PROVIDER_TYPE_MISMATCH',
  PRODUCT_NOT_SUBSCRIBED: 'PRODUCT_NOT_SUBSCRIBED',
  PHOTO_HASH_REUSED: 'PHOTO_HASH_REUSED',
  VERIFICATION_ILLEGAL_TRANSITION: 'VERIFICATION_ILLEGAL_TRANSITION',
};

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: { code?: string; message?: string; error?: string };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    parsed = { message: text };
  }
  if (!res.ok) {
    const serverCode: AddressIQErrorCode | undefined = parsed.code ? SERVER_CODE_MAP[parsed.code] : undefined;
    const msg = parsed.message ?? parsed.error ?? `HTTP ${res.status}`;
    throw new AddressIQError(serverCode ?? 'HTTP_ERROR', msg, {
      httpStatus: res.status,
      serverPayload: parsed,
    });
  }
  return parsed as T;
}

export async function getStatus(verificationCode: string): Promise<VerificationResult> {
  const { apiUrl } = resolveUrls();
  const res = await fetch(`${apiUrl}/api/v1/verifications/${verificationCode}`, {
    method: 'GET',
    headers: buildHeaders(),
  });
  return jsonOrThrow<VerificationResult>(res);
}

export async function startPhysical(args: StartPhysicalArgs): Promise<StartPhysicalResult> {
  const { apiUrl } = resolveUrls();
  const res = await fetch(
    `${apiUrl}/api/v1/locations/${encodeURIComponent(args.locationCode)}/verifications/physical`,
    {
      method: 'POST',
      headers: buildHeaders({ 'idempotency-key': args.idempotencyKey }),
      body: JSON.stringify({
        provider: args.provider,
        ...(args.appointmentSlot ? { metadata: { appointmentSlot: args.appointmentSlot } } : {}),
      }),
    },
  );
  const raw = await jsonOrThrow<{
    verificationCode: string;
    status: string;
    geofence?: StartPhysicalResult['geofence'];
  }>(res);
  return {
    verificationCode: raw.verificationCode,
    status: raw.status,
    geofence: raw.geofence,
  };
}

export async function startCombined(args: StartCombinedArgs): Promise<StartCombinedResult> {
  const { apiUrl } = resolveUrls();
  const res = await fetch(
    `${apiUrl}/api/v1/locations/${encodeURIComponent(args.locationCode)}/verifications/combined`,
    {
      method: 'POST',
      headers: buildHeaders({ 'idempotency-key': args.idempotencyKey }),
      body: JSON.stringify({
        digitalProvider: args.digitalProvider ?? 'internal_ai',
        physicalProvider: args.physicalProvider,
      }),
    },
  );
  const raw = await jsonOrThrow<{
    combinedVerificationId?: string;
    status: string;
    digital: { verificationCode: string };
    physical: { verificationCode: string };
    geofence?: StartCombinedResult['geofence'];
  }>(res);
  return {
    verificationCode: raw.digital.verificationCode,
    status: raw.status,
    digitalVerificationCode: raw.digital.verificationCode,
    physicalVerificationCode: raw.physical.verificationCode,
    combinedVerificationId: raw.combinedVerificationId,
    geofence: raw.geofence,
  };
}

export async function startVerification(args: StartVerificationArgs): Promise<StartVerificationResult> {
  const { apiUrl } = resolveUrls();
  const res = await fetch(
    `${apiUrl}/api/v1/locations/${encodeURIComponent(args.locationCode)}/verifications/digital`,
    {
      method: 'POST',
      headers: buildHeaders({ 'idempotency-key': args.idempotencyKey }),
      body: JSON.stringify({
        digitalProvider: args.digitalProvider ?? 'internal_ai',
      }),
    },
  );
  const raw = await jsonOrThrow<{
    verificationCode: string;
    status: string;
    geofence?: StartVerificationResult['geofence'];
  }>(res);
  return {
    verificationCode: raw.verificationCode,
    status: raw.status,
    geofence: raw.geofence,
  };
}

export async function cancelVerification(
  verificationCode: string,
  idempotencyKey: string,
): Promise<{ verificationCode: string; status: string }> {
  const { apiUrl } = resolveUrls();
  const res = await fetch(`${apiUrl}/api/v1/verifications/${verificationCode}/cancel`, {
    method: 'POST',
    headers: buildHeaders({ 'idempotency-key': idempotencyKey }),
  });
  return jsonOrThrow<{ verificationCode: string; status: string }>(res);
}

export async function listProviders(type?: 'digital' | 'physical'): Promise<ProviderEntry[]> {
  const { apiUrl } = resolveUrls();
  const url = new URL(`${apiUrl}/api/v1/providers`);
  if (type) url.searchParams.set('type', type);
  const res = await fetch(url.toString(), { method: 'GET', headers: buildHeaders() });
  return jsonOrThrow<ProviderEntry[]>(res);
}
