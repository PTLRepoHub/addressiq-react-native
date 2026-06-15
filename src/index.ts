/**
 * `@addressiq/react-native` — core (bare-workflow) React Native SDK.
 *
 * Functional surface matches `@addressiq/expo-react-native-sdk`. Differences:
 *   - No `expo-location` / `expo-task-manager` peer deps.
 *   - Background pinging is delivered through a native TurboModule
 *     (see `src/native/`) instead of expo-task-manager.
 *   - `getCurrentLocation` and permission probes go through `getNativeModule()`
 *     which falls back to `navigator.geolocation` when the native module
 *     hasn't been linked (Metro dev, unit tests, Snack-style previews).
 *
 * Pick this package when your app is on the **bare React Native** workflow
 * or when your CI cannot rely on EAS/Expo prebuild. Pick the Expo package
 * when your project is on the managed workflow.
 */

import { setConfig, getConfig, resolveUrls, resetConfig } from './config';
import { getNativeModule, getNativeEmitter, isNativeLinked } from './native/bridge';
import { AddressIQError } from './errors';
import * as telemetry from './telemetry';
import * as api from './api';
import { startCollectionForVerification } from './collection';
import { makeIdempotencyKey } from './idempotency';
import type {
  AddressIQConfig,
  SdkUser,
  SdkLifecycleState,
  VerificationLifecycleState,
  PermissionState,
  DeviceCapabilities,
  VerificationResult,
  StatusChangeCallback,
  BackgroundPingingOptions,
  LocationReading,
  GeofenceOptions,
  GeofenceTransition,
} from './types';

// Re-exports
export type {
  AddressIQConfig,
  AddressIQEnvironment,
  AddressIQTheme,
  AddressData,
  CollectResult,
  VerifyResult,
  IQLocationManagerProps,
  SdkUser,
  SdkLifecycleState,
  VerificationLifecycleState,
  PermissionState,
  PermissionStatus,
  DeviceCapabilities,
  LocationReading,
  LocationEvent,
  LocationEventType,
  VerificationResult,
  StatusChangeCallback,
  BackgroundPingingOptions,
  GeofenceOptions,
  GeofenceTransition,
} from './types';
export type {
  StartPhysicalArgs,
  StartPhysicalResult,
  StartCombinedArgs,
  StartCombinedResult,
  StartVerificationArgs,
  StartVerificationResult,
  ProviderEntry,
} from './api';

export { isNativeLinked } from './native/bridge';
export { default as IQLocationManager } from './ui/IQLocationManager';
export { DEFAULT_THEME, mergeTheme } from './ui/theme';
export { AddressIQError, isAddressIQError } from './errors';
export type { AddressIQErrorCode } from './errors';

// ── Module state ──

let user: SdkUser | null = null;
let lifecycleState: SdkLifecycleState = 'UNINITIALIZED';
let activeVerificationId: string | null = null;
let activeLocationCode: string | null = null;
let pausedAt: number | null = null;
let statusListeners: StatusChangeCallback[] = [];

/** Tracks Android permission prompts so BLOCKED can be distinguished from NOT_DETERMINED. */
let androidFgPermissionPrompted = false;
let androidBgPermissionPrompted = false;

// ── Public API ──

/**
 * Initialise the SDK. Must be called once at app start before any other
 * SDK call. Safe to call repeatedly with the same config — the last call
 * wins.
 */
export function initialize(config: AddressIQConfig): void {
  if (!config.apiKey) throw new AddressIQError('INVALID_CONFIG', 'apiKey is required');
  setConfig(config);
  if (lifecycleState === 'UNINITIALIZED' || lifecycleState === 'TERMINATED') {
    lifecycleState = 'IDLE';
  }
}

/**
 * Bind the end user to the current SDK session. Switching to a different
 * user pauses the previous user's collection before associating the new
 * identity.
 */
export async function setUser(nextUser: SdkUser): Promise<void> {
  getConfig(); // throws if not initialized
  if (!nextUser.appUserId) throw new AddressIQError('INVALID_USER', 'setUser: appUserId is required');

  if (user && user.appUserId !== nextUser.appUserId) {
    await pauseVerification().catch(() => undefined);
  }
  user = { ...nextUser };
  if (lifecycleState === 'UNINITIALIZED' || lifecycleState === 'TERMINATED') {
    lifecycleState = 'IDLE';
  }
}

/**
 * Detach the current user from this device. Stops local collection and
 * notifies the backend so push tokens deactivate. Verification state is
 * paused (not cancelled).
 */
export async function logout(): Promise<void> {
  if (lifecycleState === 'UNINITIALIZED') return;
  await pauseVerification().catch(() => undefined);
  await telemetry.flushQueue().catch(() => undefined);
  telemetry.clearSession();

  if (user) {
    try {
      const { apiUrl } = resolveUrls();
      const cfg = getConfig();
      await fetch(`${apiUrl}/api/v1/sdk/session`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey,
        },
        body: JSON.stringify({
          appUserId: user.appUserId,
          verificationCode: activeVerificationId,
        }),
      });
    } catch {
      // Best-effort — local teardown still happens.
    }
  }

  user = null;
  activeVerificationId = null;
  activeLocationCode = null;
  pausedAt = null;
  lifecycleState = 'TERMINATED';
}

/**
 * Probe device capabilities: permissions, GPS availability, mock-location
 * detection. Safe to call without prompting the user.
 */
export async function checkDeviceCapabilities(): Promise<DeviceCapabilities> {
  const native = getNativeModule();
  const [fg, bg, mock] = await Promise.all([
    native.hasLocationPermission(),
    native.hasBackgroundLocationPermission(),
    native.isMockLocationDetected(),
  ]);
  return {
    hasGps: true,
    hasNetwork: true,
    permissions: {
      foregroundLocation: fg ? 'GRANTED' : 'NOT_DETERMINED',
      backgroundLocation: bg ? 'GRANTED' : 'NOT_DETERMINED',
      notifications: 'NOT_DETERMINED',
    },
    isMockLocationDetected: mock,
    os: ((): 'IOS' | 'ANDROID' => {
      const Platform = require('react-native').Platform as { OS: string };
      return Platform.OS === 'ios' ? 'IOS' : 'ANDROID';
    })(),
    osVersion: native.getPlatformVersion(),
  };
}

/**
 * Request foreground + background location permissions.
 *
 * Android: uses `PermissionsAndroid` from `react-native` so the system
 * permission dialog is coordinated with the activity that hosts the
 * RN bridge. On Android 10+ background location is requested after
 * foreground is granted (a Google policy requirement).
 *
 * iOS: delegates to the native module, which calls
 * `requestWhenInUseAuthorization` then `requestAlwaysAuthorization` and
 * resolves the promise via the `CLLocationManagerDelegate` callback.
 *
 * Returns true only when **both** foreground and background grants
 * succeed. A partial grant (foreground only) returns false; the host
 * app can still call `getCurrentLocation()` in that case.
 */
export async function requestPermissions(): Promise<boolean> {
  const { Platform, PermissionsAndroid } = require('react-native') as {
    Platform: { OS: string; Version: number };
    PermissionsAndroid: {
      PERMISSIONS: Record<string, string>;
      RESULTS: { GRANTED: string };
      requestMultiple: (perms: string[]) => Promise<Record<string, string>>;
      request: (perm: string) => Promise<string>;
    };
  };

  if (Platform.OS === 'android') {
    const fg = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    androidFgPermissionPrompted = true;
    const fineGranted =
      fg[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
    if (!fineGranted) return false;
    if (Platform.Version >= 29) {
      const bg = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
      );
      androidBgPermissionPrompted = true;
      return bg === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  }

  const native = getNativeModule();
  const fg = await native.requestLocationPermission();
  if (!fg) return false;
  return native.requestBackgroundLocationPermission();
}

/**
 * Per-permission rationale flag. Returns `true` for a permission when
 * the OS allows showing a rationale prompt (i.e. the user denied once
 * but didn't tick "Don't ask again"). Use this to gate "Why we need
 * this" UI between requests.
 *
 * Android-only — iOS does not expose an equivalent surface. Returns
 * `false` for all keys on iOS.
 */
export async function shouldShowRationale(): Promise<{
  foregroundLocation: boolean;
  backgroundLocation: boolean;
  notifications: boolean;
}> {
  const { Platform, PermissionsAndroid } = require('react-native') as {
    Platform: { OS: string; Version: number };
    PermissionsAndroid: {
      PERMISSIONS: Record<string, string>;
      shouldShowRequestPermissionRationale: (perm: string) => Promise<boolean>;
    };
  };
  if (Platform.OS !== 'android') {
    return { foregroundLocation: false, backgroundLocation: false, notifications: false };
  }
  const [fg, bg, notif] = await Promise.all([
    PermissionsAndroid.shouldShowRequestPermissionRationale(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ),
    Platform.Version >= 29
      ? PermissionsAndroid.shouldShowRequestPermissionRationale(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
        )
      : Promise.resolve(false),
    Platform.Version >= 33
      ? PermissionsAndroid.shouldShowRequestPermissionRationale(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        )
      : Promise.resolve(false),
  ]);
  return { foregroundLocation: fg, backgroundLocation: bg, notifications: notif };
}

/**
 * Deep-link to the host app's settings page so the user can re-enable a
 * permanently-denied permission. The OS will not re-prompt until they
 * toggle the grant manually.
 */
export async function openSettings(): Promise<boolean> {
  const { Linking } = require('react-native') as {
    Linking: { openSettings: () => Promise<void> };
  };
  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}

/** Snapshot of the current permission state. */
export async function getPermissionState(): Promise<PermissionState> {
  const { Platform, PermissionsAndroid } = require('react-native') as {
    Platform: { OS: string; Version: number };
    PermissionsAndroid?: {
      PERMISSIONS: Record<string, string>;
      RESULTS: { GRANTED: string };
      check: (perm: string) => Promise<boolean>;
      shouldShowRequestPermissionRationale: (perm: string) => Promise<boolean>;
    };
  };

  if (Platform.OS === 'android' && PermissionsAndroid) {
    const fgPerm = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    const bgPerm = PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION;
    const [fgGranted, bgGranted] = await Promise.all([
      PermissionsAndroid.check(fgPerm),
      Platform.Version >= 29
        ? PermissionsAndroid.check(bgPerm)
        : PermissionsAndroid.check(fgPerm),
    ]);
    return {
      foregroundLocation: fgGranted
        ? 'GRANTED'
        : await mapAndroidPermissionStatus(fgPerm, androidFgPermissionPrompted),
      backgroundLocation: bgGranted
        ? 'GRANTED'
        : Platform.Version >= 29
          ? await mapAndroidPermissionStatus(bgPerm, androidBgPermissionPrompted)
          : fgGranted
            ? 'GRANTED'
            : await mapAndroidPermissionStatus(fgPerm, androidFgPermissionPrompted),
      notifications: 'NOT_DETERMINED',
    };
  }

  const native = getNativeModule();
  const status = await native.getLocationPermissionStatuses();
  return {
    foregroundLocation: status.foreground,
    backgroundLocation: status.background,
    notifications: 'NOT_DETERMINED',
  };
}

/** Take one high-accuracy foreground reading. */
export async function getCurrentLocation(highAccuracy = true): Promise<LocationReading> {
  const native = getNativeModule();
  const r = await native.getCurrentLocation(highAccuracy);
  return {
    lat: r.lat,
    lon: r.lon,
    accuracyM: r.accuracyM,
    altitudeM: r.altitudeM ?? undefined,
    speedMps: r.speedMps ?? undefined,
    headingDeg: r.headingDeg ?? undefined,
    timestampMs: r.timestampMs,
    isMock: r.isMock,
    provider: (r.provider as LocationReading['provider']) ?? undefined,
  };
}

/**
 * Start native background location collection.
 *
 * **This is signal-driven, NOT a polling loop.** The native module subscribes
 * to OS-fired events:
 *
 *   1. **Geofence transitions** (ENTER / EXIT / DWELL) at the adaptive radius
 *      the backend assigned for the location. Play Services on Android +
 *      `CLCircularRegion` monitoring on iOS deliver these — zero wake-ups
 *      while the user is inside the fence and stationary.
 *   2. **Distance-filtered position updates** (`distanceFilterM`, default 50m).
 *      The OS only emits a fix when the device has moved by at least that
 *      distance, so a parked phone produces no events at all.
 *   3. **Significant-change location** (iOS) as a low-power fallback when
 *      the app is suspended.
 *
 * `minIntervalMs` is a **deferred-updates ceiling** — the OS batches
 * background fixes and never wakes the SDK more often than this. Lowering
 * it does NOT increase signal frequency; it only thins out the batching
 * window and burns battery. The 15-minute default is the validated floor —
 * do not tune lower in production.
 *
 * Requires the user to have granted background location permission first
 * (`requestPermissions()`).
 */
export async function startBackgroundPinging(
  options: BackgroundPingingOptions = {},
): Promise<{ started: boolean }> {
  const native = getNativeModule();
  const started = await native.startBackgroundLocation({
    accuracy: options.accuracy ?? 'balanced',
    intervalMs: options.minIntervalMs ?? 15 * 60 * 1000,
    distanceFilterM: options.distanceFilterM ?? 50,
    notificationTitle: options.notificationTitle ?? 'Verifying your address',
    notificationBody: options.notificationBody ?? 'Location is being collected in the background',
  });
  return { started };
}

export async function stopBackgroundPinging(): Promise<void> {
  await getNativeModule().stopBackgroundLocation();
}

export async function isBackgroundRunning(): Promise<boolean> {
  return getNativeModule().isBackgroundRunning();
}

/** Subscribe to native location updates emitted while background pinging is active. */
export function onLocationUpdate(cb: (reading: LocationReading) => void): () => void {
  const emitter = getNativeEmitter();
  const sub = emitter.addListener('AddressIQLocationUpdate', (raw: LocationReading) => cb(raw));
  return () => sub.remove();
}

/**
 * Register an adaptive geofence around a verification location.
 *
 * The OS (Play Services on Android, `CLCircularRegion` monitoring on
 * iOS) delivers ENTER/EXIT/DWELL transitions to the SDK without polling.
 * `startPhysical()` and `startCombined()` register geofences
 * automatically when the API response includes geofence coordinates;
 * call this directly only when wiring your own flow.
 */
export async function registerGeofence(options: GeofenceOptions): Promise<{ registered: boolean }> {
  const registered = await getNativeModule().registerGeofence({
    identifier: options.identifier,
    lat: options.lat,
    lon: options.lon,
    radiusM: options.radiusM,
    loiteringDelayMs: options.loiteringDelayMs ?? 60_000,
  });
  return { registered };
}

export async function unregisterGeofence(identifier: string): Promise<void> {
  await getNativeModule().unregisterGeofence(identifier);
}

export async function unregisterAllGeofences(): Promise<void> {
  await getNativeModule().unregisterAllGeofences();
}

/** Subscribe to OS-fired geofence ENTER/EXIT/DWELL transitions. */
export function onGeofenceTransition(cb: (event: GeofenceTransition) => void): () => void {
  const emitter = getNativeEmitter();
  const sub = emitter.addListener('AddressIQGeofenceTransition', (raw: GeofenceTransition) => cb(raw));
  return () => sub.remove();
}

// ── Verification lifecycle ──

/**
 * Start a physical address verification. A partner-provided agent or
 * KYC provider visits the address to confirm residency.
 */
/**
 * Start a digital address verification. Uses SDK telemetry + geofencing
 * to score residency at the given location.
 */
export async function startVerification(
  args: Omit<api.StartVerificationArgs, 'idempotencyKey'> & { idempotencyKey?: string },
): Promise<api.StartVerificationResult> {
  await assertReadyForVerificationStart();
  const result = await api.startVerification({
    ...args,
    idempotencyKey: args.idempotencyKey ?? makeIdempotencyKey('digital'),
  });
  await activateVerificationSession(args.locationCode, result.verificationCode, result.geofence);
  return result;
}

export async function startPhysicalVerification(
  args: Omit<api.StartPhysicalArgs, 'idempotencyKey'> & { idempotencyKey?: string },
): Promise<api.StartPhysicalResult> {
  await assertReadyForVerificationStart();
  const result = await api.startPhysical({
    ...args,
    idempotencyKey: args.idempotencyKey ?? makeIdempotencyKey('physical'),
  });
  await activateVerificationSession(args.locationCode, result.verificationCode, result.geofence);
  return result;
}

/**
 * Start a combined digital + physical verification. Digital runs first
 * via the AI provider (uses SDK telemetry to score residency); physical
 * fallback fires if the digital half resolves to UNKNOWN.
 */
export async function startDigitalAndPhysicalVerification(
  args: Omit<api.StartCombinedArgs, 'idempotencyKey'> & { idempotencyKey?: string },
): Promise<api.StartCombinedResult> {
  await assertReadyForVerificationStart();
  const result = await api.startCombined({
    ...args,
    idempotencyKey: args.idempotencyKey ?? makeIdempotencyKey('combined'),
  });
  await activateVerificationSession(args.locationCode, result.verificationCode, result.geofence);
  return result;
}


export async function cancelVerification(
  verificationCode: string,
  idempotencyKey?: string,
): Promise<{ verificationCode: string; status: string }> {
  const result = await api.cancelVerification(
    verificationCode,
    idempotencyKey ?? makeIdempotencyKey('cancel'),
  );
  await unregisterGeofence(verificationCode).catch(() => undefined);
  await stopBackgroundPinging().catch(() => undefined);
  await telemetry.flushQueue().catch(() => undefined);
  telemetry.clearSession();
  lifecycleState = 'IDLE';
  return result;
}

export async function listProviders(type?: 'digital' | 'physical'): Promise<api.ProviderEntry[]> {
  return api.listProviders(type);
}

export async function getVerificationStatus(verificationCode: string): Promise<VerificationResult> {
  const result = await api.getStatus(verificationCode);
  notifyListeners(result);
  return result;
}

/**
 * Register a callback fired when the SDK observes a verification result.
 *
 * **The SDK does not poll the backend** — listeners fire when:
 *   - your code calls `getVerificationStatus(code)` and the API returns
 *     a result, or
 *   - your push-notification handler dispatches a status into the SDK
 *     by calling `getVerificationStatus(code)`.
 *
 * Matches the lifecycle-stream contract on the canonical iOS, Android,
 * and Flutter SDKs. Status delivery is the host app's job (push
 * notifications + on-foreground pulls); the SDK provides only the
 * listener fan-out.
 */
export function onStatusChange(cb: StatusChangeCallback): () => void {
  statusListeners.push(cb);
  return () => {
    statusListeners = statusListeners.filter((listener) => listener !== cb);
  };
}

export async function pauseVerification(): Promise<void> {
  if (lifecycleState !== 'COLLECTING') return;
  await stopBackgroundPinging().catch(() => undefined);
  pausedAt = Date.now();
  lifecycleState = 'PAUSED';
}

export async function resumeVerification(): Promise<void> {
  if (lifecycleState !== 'PAUSED') return;
  if (!activeVerificationId || !activeLocationCode) {
    throw new AddressIQError('NO_ACTIVE_SESSION', 'resumeVerification: no active session to resume');
  }
  await startBackgroundPinging();
  pausedAt = null;
  lifecycleState = 'COLLECTING';
}

/**
 * Force-flush the in-memory telemetry queue to `/v1/transit-events/batch`.
 * Returns the count of events successfully uploaded.
 */
export async function sync(): Promise<{ flushed: number }> {
  return telemetry.flushQueue();
}

export async function reset(): Promise<void> {
  await stopBackgroundPinging().catch(() => undefined);
  telemetry.wipeTelemetry();
  user = null;
  activeVerificationId = null;
  activeLocationCode = null;
  pausedAt = null;
  statusListeners = [];
  lifecycleState = 'UNINITIALIZED';
  resetConfig();
}

export function getVerificationState(): VerificationLifecycleState {
  return {
    state: lifecycleState,
    appUserId: user?.appUserId,
    verificationId: activeVerificationId ?? undefined,
    locationCode: activeLocationCode ?? undefined,
    pausedForMs: pausedAt ? Date.now() - pausedAt : undefined,
  };
}

// ── Internals ──

function notifyListeners(result: VerificationResult): void {
  for (const cb of statusListeners) {
    try {
      cb(result);
    } catch {
      // Don't break the SDK on listener errors.
    }
  }
}


/**
 * Auto-register an adaptive geofence after `startPhysical` / `startCombined`
 * if the backend returned one. Silently no-ops when the API response
 * omits coordinates — callers who manage geofences themselves can call
 * `registerGeofence()` directly.
 */
async function assertReadyForVerificationStart(): Promise<void> {
  getConfig();
  if (!user?.appUserId) {
    throw new AddressIQError('INVALID_USER', 'setUser: appUserId is required before starting verification');
  }
  if (lifecycleState !== 'IDLE' && lifecycleState !== 'PAUSED') {
    throw new AddressIQError(
      'ARGS_INVALID',
      `Cannot start verification while lifecycle state is ${lifecycleState}`,
    );
  }
  const permissions = await getPermissionState();
  if (
    permissions.foregroundLocation !== 'GRANTED' ||
    permissions.backgroundLocation !== 'GRANTED'
  ) {
    throw new AddressIQError(
      'PERMISSION_DENIED',
      'Foreground and background location permissions are required before starting verification',
    );
  }
}

async function activateVerificationSession(
  locationCode: string,
  verificationCode: string,
  geofence: { lat: number; lon: number; radiusM: number } | undefined,
): Promise<void> {
  activeVerificationId = verificationCode;
  activeLocationCode = locationCode;
  lifecycleState = 'COLLECTING';
  pausedAt = null;
  await startCollectionForVerification(locationCode, verificationCode, geofence);
}

async function mapAndroidPermissionStatus(
  permission: string,
  prompted: boolean,
): Promise<PermissionState['foregroundLocation']> {
  const { PermissionsAndroid } = require('react-native') as {
    PermissionsAndroid: {
      shouldShowRequestPermissionRationale: (perm: string) => Promise<boolean>;
    };
  };
  const rationale = await PermissionsAndroid.shouldShowRequestPermissionRationale(permission);
  if (rationale) return 'DENIED';
  return prompted ? 'BLOCKED' : 'NOT_DETERMINED';
}
