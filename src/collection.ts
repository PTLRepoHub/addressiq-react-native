/**
 * Shared wiring for starting OS-level collection after a verification
 * session is created (imperative API or widget submit).
 */
import { getNativeModule } from './native/bridge';
import * as telemetry from './telemetry';
export async function startCollectionForVerification(
  locationCode: string,
  verificationCode: string,
  geofence?: { lat: number; lon: number; radiusM: number },
): Promise<void> {
  telemetry.setSession(locationCode, verificationCode);
  if (geofence) {
    try {
      await getNativeModule().registerGeofence({
        identifier: verificationCode,
        lat: geofence.lat,
        lon: geofence.lon,
        radiusM: geofence.radiusM,
        loiteringDelayMs: 60_000,
      });
    } catch {
      // Best-effort — partner can call registerGeofence manually.
    }
  }
  try {
    await getNativeModule().startBackgroundLocation({
      accuracy: 'balanced',
      intervalMs: 15 * 60 * 1000,
      distanceFilterM: 50,
      notificationTitle: 'Verifying your address',
      notificationBody: 'Location is being collected in the background',
    });
  } catch {
    // Collection may be unavailable in JS-fallback mode.
  }
  void telemetry.flushQueue().catch(() => undefined);
}
