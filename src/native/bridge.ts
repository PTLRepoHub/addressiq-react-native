/**
 * Native module accessor with a JS fallback.
 *
 * On real devices with the native module linked, this returns the
 * TurboModule. In Expo Go / Metro before rebuild / unit tests, it returns
 * a JS fallback that uses `navigator.geolocation` (where available) and
 * resolves background-pinging calls to no-ops with a console.warn.
 *
 * The fallback exists so partners can iterate on JS without rebuilding
 * the native app on every change. It is NOT production-grade —
 * `isBackgroundRunning()` will always return false in fallback mode.
 */
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { Spec } from './spec/NativeAddressIQLocation';

let cachedModule: Spec | null = null;
let cachedEmitter: NativeEventEmitter | null = null;
let warnedFallback = false;

function buildFallback(): Spec {
  if (!warnedFallback) {
    console.warn(
      '[AddressIQ] Native module not found. Running in JS-fallback mode — background pinging is disabled. Rebuild the native app (`pod install && react-native run-ios`) to enable full functionality.',
    );
    warnedFallback = true;
  }

  const fb: Spec = {
    getPlatformVersion: () => `${Platform.OS}-${Platform.Version}-fallback`,
    hasLocationPermission: async () => false,
    hasBackgroundLocationPermission: async () => false,
    getLocationPermissionStatuses: async () => ({
      foreground: 'NOT_DETERMINED',
      background: 'NOT_DETERMINED',
    }),
    requestLocationPermission: async () => false,
    requestBackgroundLocationPermission: async () => false,
    isMockLocationDetected: async () => false,
    getCurrentLocation: (highAccuracy: boolean) =>
      new Promise((resolve, reject) => {
        const geo = (globalThis as { navigator?: { geolocation?: unknown } }).navigator?.geolocation as
          | {
              getCurrentPosition: (
                ok: (pos: { coords: { latitude: number; longitude: number; accuracy: number; altitude: number | null; speed: number | null; heading: number | null }; timestamp: number }) => void,
                err: (e: Error) => void,
                opts?: { enableHighAccuracy?: boolean; timeout?: number },
              ) => void;
            }
          | undefined;
        if (!geo?.getCurrentPosition) {
          reject(new Error('[AddressIQ] getCurrentLocation unavailable: no native module and no navigator.geolocation'));
          return;
        }
        geo.getCurrentPosition(
          (pos) =>
            resolve({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracyM: pos.coords.accuracy ?? 0,
              altitudeM: pos.coords.altitude,
              speedMps: pos.coords.speed,
              headingDeg: pos.coords.heading,
              timestampMs: pos.timestamp,
              isMock: false,
              provider: 'fallback',
            }),
          (err) => reject(err),
          { enableHighAccuracy: highAccuracy, timeout: 10_000 },
        );
      }),
    startBackgroundLocation: async () => false,
    stopBackgroundLocation: async () => undefined,
    isBackgroundRunning: async () => false,
    registerGeofence: async () => false,
    unregisterGeofence: async () => undefined,
    unregisterAllGeofences: async () => undefined,
    addListener: () => undefined,
    removeListeners: () => undefined,
  };
  return fb;
}

export function getNativeModule(): Spec {
  if (cachedModule) return cachedModule;
  const native = (NativeModules as Record<string, unknown>).AddressIQLocation as Spec | undefined;
  cachedModule = native ?? buildFallback();
  return cachedModule;
}

export function getNativeEmitter(): NativeEventEmitter {
  if (cachedEmitter) return cachedEmitter;
  const native = (NativeModules as Record<string, unknown>).AddressIQLocation as object | undefined;
  cachedEmitter = native
    ? new NativeEventEmitter(native as ConstructorParameters<typeof NativeEventEmitter>[0])
    : new NativeEventEmitter();
  return cachedEmitter;
}

/** Returns true when the real TurboModule is linked. */
export function isNativeLinked(): boolean {
  return !!(NativeModules as Record<string, unknown>).AddressIQLocation;
}
