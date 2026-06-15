/**
 * Unit tests for `startCollectionForVerification` — the shared wiring that
 * runs after a verification session is created on BOTH integration tracks
 * (widget `onComplete` and imperative `start*`). Guards P0-5 / P0-11:
 * collection must wire telemetry + geofence + background using the public
 * codes, in the documented argument order.
 *
 * The native bridge and telemetry modules are mocked so the test runs in a
 * plain Node environment (no React Native runtime).
 */

const mockNative = {
  registerGeofence: jest.fn(async () => undefined),
  startBackgroundLocation: jest.fn(async () => undefined),
};

jest.mock('../src/native/bridge', () => ({
  getNativeModule: jest.fn(() => mockNative),
}));

jest.mock('../src/telemetry', () => ({
  setSession: jest.fn(),
  flushQueue: jest.fn(async () => 0),
}));

import { startCollectionForVerification } from '../src/collection';
import * as telemetry from '../src/telemetry';

describe('startCollectionForVerification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('binds the telemetry session with (locationCode, verificationCode) — codes, not UUIDs', async () => {
    await startCollectionForVerification('loc_abc123', 'ver_xyz789');
    expect(telemetry.setSession).toHaveBeenCalledWith('loc_abc123', 'ver_xyz789');
  });

  it('starts background location collection', async () => {
    await startCollectionForVerification('loc_abc123', 'ver_xyz789');
    expect(mockNative.startBackgroundLocation).toHaveBeenCalledTimes(1);
  });

  it('registers the geofence keyed by verificationCode when a geofence is supplied', async () => {
    await startCollectionForVerification('loc_abc123', 'ver_xyz789', {
      lat: 6.5244,
      lon: 3.3792,
      radiusM: 120,
    });
    expect(mockNative.registerGeofence).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'ver_xyz789', lat: 6.5244, lon: 3.3792, radiusM: 120 }),
    );
  });

  it('does not register a geofence when none is supplied', async () => {
    await startCollectionForVerification('loc_abc123', 'ver_xyz789');
    expect(mockNative.registerGeofence).not.toHaveBeenCalled();
  });

  it('flushes the telemetry queue after wiring collection', async () => {
    await startCollectionForVerification('loc_abc123', 'ver_xyz789');
    expect(telemetry.flushQueue).toHaveBeenCalled();
  });

  it('still resolves when native collection throws (JS-fallback tolerance)', async () => {
    mockNative.startBackgroundLocation.mockRejectedValueOnce(new Error('no native module'));
    await expect(
      startCollectionForVerification('loc_abc123', 'ver_xyz789'),
    ).resolves.toBeUndefined();
    // Session binding + flush still happen even if background start fails.
    expect(telemetry.setSession).toHaveBeenCalled();
    expect(telemetry.flushQueue).toHaveBeenCalled();
  });
});
