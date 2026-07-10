import { routeBridgeMessage, type BridgeSinks } from '../src/ui/bridgeRouter';

/**
 * Unit tests for the web-widget bridge protocol mapping. Guards that the React
 * Native shell stays in lockstep with the shared web `HostBridge` shapes — the
 * same protocol the iOS WKWebView integration test exercises against the real
 * widget, and the Android `WebFlowMessageRouter` tests cover.
 */
function recorder() {
  const calls = {
    completed: undefined as undefined | { locationCode: string; formattedAddress?: string; lat: number; lon: number },
    cancelled: false,
    failed: undefined as undefined | string,
    locationRequestId: undefined as undefined | string,
    permissionRequestId: undefined as undefined | string,
    permissionStateId: undefined as undefined | string,
    openSettingsId: undefined as undefined | string,
    resolved: undefined as undefined | [string, unknown],
    rejected: undefined as undefined | [string, string, string],
    permission: 'granted',
  };
  const sinks: BridgeSinks = {
    onCompleted: (r) => { calls.completed = r; },
    onCancelled: () => { calls.cancelled = true; },
    onFailed: (e) => { calls.failed = e.message; },
    onLocationRequest: (id) => { calls.locationRequestId = id; },
    onPermissionRequest: (id) => { calls.permissionRequestId = id; },
    onGetPermissionState: (id) => { calls.permissionStateId = id; },
    onOpenSettings: (id) => { calls.openSettingsId = id; },
    permissionStatus: () => calls.permission,
    resolve: (id, value) => { calls.resolved = [id, value]; },
    reject: (id, code, message) => { calls.rejected = [id, code, message]; },
  };
  return { calls, sinks };
}

describe('routeBridgeMessage', () => {
  it('maps addressSelected to a CollectResult', () => {
    const { calls, sinks } = recorder();
    routeBridgeMessage(
      JSON.stringify({ kind: 'event', name: 'addressSelected', payload: { locationCode: 'LOC-1', formattedAddress: '1 Marina', geoPoint: { lat: 6.5, lng: 3.4 } } }),
      sinks,
    );
    expect(calls.completed).toEqual({ locationCode: 'LOC-1', formattedAddress: '1 Marina', lat: 6.5, lon: 3.4, placeId: undefined });
  });

  it('treats verificationStarted as terminal completion', () => {
    const { calls, sinks } = recorder();
    routeBridgeMessage(JSON.stringify({ kind: 'event', name: 'verificationStarted', payload: { locationCode: 'LOC-9' } }), sinks);
    expect(calls.completed?.locationCode).toBe('LOC-9');
  });

  it('maps close to cancel and error to fail', () => {
    const a = recorder();
    routeBridgeMessage(JSON.stringify({ kind: 'event', name: 'close' }), a.sinks);
    expect(a.calls.cancelled).toBe(true);

    const b = recorder();
    routeBridgeMessage(JSON.stringify({ kind: 'event', name: 'error', payload: { message: 'boom' } }), b.sinks);
    expect(b.calls.failed).toBe('boom');
  });

  it('resolves getPermissionStatus with the mapped permission', () => {
    const { calls, sinks } = recorder();
    calls.permission = 'denied';
    routeBridgeMessage(JSON.stringify({ kind: 'request', id: 'req_1', action: 'getPermissionStatus' }), sinks);
    expect(calls.resolved).toEqual(['req_1', 'denied']);
  });

  it('delegates getLocation to the location handler', () => {
    const { calls, sinks } = recorder();
    routeBridgeMessage(JSON.stringify({ kind: 'request', id: 'req_2', action: 'getLocation' }), sinks);
    expect(calls.locationRequestId).toBe('req_2');
  });

  it('delegates requestPermission to the permission handler', () => {
    const { calls, sinks } = recorder();
    routeBridgeMessage(JSON.stringify({ kind: 'request', id: 'req_4', action: 'requestPermission' }), sinks);
    expect(calls.permissionRequestId).toBe('req_4');
  });

  it('delegates getPermissionState and openSettings', () => {
    const { calls, sinks } = recorder();
    routeBridgeMessage(JSON.stringify({ kind: 'request', id: 'req_5', action: 'getPermissionState' }), sinks);
    expect(calls.permissionStateId).toBe('req_5');
    routeBridgeMessage(JSON.stringify({ kind: 'request', id: 'req_6', action: 'openSettings' }), sinks);
    expect(calls.openSettingsId).toBe('req_6');
  });

  it('rejects unknown actions', () => {
    const { calls, sinks } = recorder();
    routeBridgeMessage(JSON.stringify({ kind: 'request', id: 'req_3', action: 'teleport' }), sinks);
    expect(calls.rejected?.[0]).toBe('req_3');
    expect(calls.rejected?.[1]).toBe('UNKNOWN_ACTION');
  });

  it('ignores malformed input', () => {
    const { calls, sinks } = recorder();
    routeBridgeMessage('not json', sinks);
    expect(calls.completed).toBeUndefined();
    expect(calls.failed).toBeUndefined();
    expect(calls.locationRequestId).toBeUndefined();
  });
});
