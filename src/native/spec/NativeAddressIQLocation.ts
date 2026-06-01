/**
 * TurboModule spec for the native AddressIQ Location module.
 *
 * Codegen reads this file (per `codegenConfig` in package.json) to generate
 * the C++/Kotlin/Swift boilerplate. The shape matches what the Kotlin and
 * Swift implementations export — keep them in sync.
 *
 * Runtime callers should NOT import this directly. Use `getNativeModule()`
 * from `../bridge` which handles the JS fallback when the native module
 * is unavailable (e.g. inside the Metro debugger or before a rebuild).
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Capability + permission probes
  getPlatformVersion(): string;
  hasLocationPermission(): Promise<boolean>;
  hasBackgroundLocationPermission(): Promise<boolean>;
  requestLocationPermission(): Promise<boolean>;
  requestBackgroundLocationPermission(): Promise<boolean>;
  isMockLocationDetected(): Promise<boolean>;

  // Foreground reading
  getCurrentLocation(highAccuracy: boolean): Promise<{
    lat: number;
    lon: number;
    accuracyM: number;
    altitudeM: number | null;
    speedMps: number | null;
    headingDeg: number | null;
    timestampMs: number;
    isMock: boolean;
    provider: string | null;
  }>;

  // Background collection — SIGNAL-DRIVEN, NEVER POLLED.
  //
  // Implementations MUST trigger on OS-fired events only:
  //   Android  → Play Services GeofencingClient (ENTER/EXIT/DWELL transitions)
  //              + FusedLocationProvider with the supplied distanceFilterM
  //              and PRIORITY_BALANCED_POWER_ACCURACY.
  //   iOS      → CLCircularRegion monitoring + significantLocationChanges
  //              + CLLocationManager with desiredAccuracy=Best/HundredMeters
  //              and distanceFilter set to options.distanceFilterM.
  //
  // `intervalMs` is `deferredUpdatesInterval` on iOS and
  // `setMaxUpdateDelayMillis` on Android — a CEILING on delivery rate, not
  // a poll frequency. Do NOT spawn a Handler/Timer that re-triggers reads.
  // A parked phone must produce zero events for as long as it stays parked.
  startBackgroundLocation(options: {
    accuracy: string;
    intervalMs: number;
    distanceFilterM: number;
    notificationTitle: string;
    notificationBody: string;
  }): Promise<boolean>;
  stopBackgroundLocation(): Promise<void>;
  isBackgroundRunning(): Promise<boolean>;

  // Adaptive geofences — registered per verification at the radius the
  // backend assigned for the location. ENTER/EXIT/DWELL transitions are
  // delivered by the OS (Play Services on Android, region monitoring on
  // iOS) and surface via the `AddressIQGeofenceTransition` event.
  registerGeofence(options: {
    identifier: string;
    lat: number;
    lon: number;
    radiusM: number;
    loiteringDelayMs: number;
  }): Promise<boolean>;
  unregisterGeofence(identifier: string): Promise<void>;
  unregisterAllGeofences(): Promise<void>;

  // Event subscription — implemented as RCTDeviceEventEmitter on both sides.
  // Emitted events:
  //   - `AddressIQLocationUpdate` { lat, lon, accuracyM, ..., eventType }
  //   - `AddressIQGeofenceTransition` { identifier, transition, lat?, lon? }
  // where `transition` is one of 'ENTER' | 'EXIT' | 'DWELL'.
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.get<Spec>('AddressIQLocation');
