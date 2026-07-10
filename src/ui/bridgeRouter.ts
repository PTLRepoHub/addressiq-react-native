import type { CollectResult } from '../types';

/**
 * Pure protocol logic for the web-widget bridge. Decodes the `HostBridge`
 * messages the shared widget posts and dispatches them to injected sinks. Kept
 * free of React / react-native-webview / native modules so the exact wire
 * mapping — which must stay in lockstep with the web `HostBridge` and the iOS /
 * Android shells — is jest-testable without a WebView.
 *
 * JS → native:
 *   { kind: 'event',   name, payload }
 *   { kind: 'request', id, action, payload }
 */
export interface BridgeSinks {
  onCompleted: (result: CollectResult) => void;
  onCancelled: () => void;
  onFailed: (error: Error) => void;
  /** Async location request — the caller runs the prompt + fix, then replies by id. */
  onLocationRequest: (id: string) => void;
  /** Async Always+Precise permission prompt — caller runs it, then replies by id. */
  onPermissionRequest: (id: string) => void;
  /** Read current grant WITHOUT prompting — caller replies { foreground, background } by id. */
  onGetPermissionState: (id: string) => void;
  /** Open the OS app-settings page — caller replies by id when launched. */
  onOpenSettings: (id: string) => void;
  /** Returns the current web-permission string ('granted'|'denied'|'prompt'|'unknown'). */
  permissionStatus: () => string;
  resolve: (id: string, value: unknown) => void;
  reject: (id: string, code: string, message: string) => void;
}

export function routeBridgeMessage(raw: string, sinks: BridgeSinks): void {
  let msg: { kind?: string; name?: string; id?: string; action?: string; payload?: any };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.kind === 'event') {
    const p = msg.payload ?? {};
    switch (msg.name) {
      case 'addressSelected':
      case 'verificationStarted':
        sinks.onCompleted({
          locationCode: p.locationCode ?? '',
          formattedAddress: p.formattedAddress,
          lat: p.geoPoint?.lat ?? 0,
          lon: p.geoPoint?.lng ?? 0,
          placeId: p.placeId,
        });
        break;
      case 'close':
        sinks.onCancelled();
        break;
      case 'error':
        sinks.onFailed(new Error(p.message ?? 'Widget reported an error'));
        break;
    }
    return;
  }

  if (msg.kind === 'request' && msg.id) {
    switch (msg.action) {
      case 'getPermissionStatus':
        sinks.resolve(msg.id, sinks.permissionStatus());
        break;
      case 'getLocation':
        sinks.onLocationRequest(msg.id);
        break;
      case 'requestPermission':
        sinks.onPermissionRequest(msg.id);
        break;
      case 'getPermissionState':
        sinks.onGetPermissionState(msg.id);
        break;
      case 'openSettings':
        sinks.onOpenSettings(msg.id);
        break;
      default:
        sinks.reject(msg.id, 'UNKNOWN_ACTION', `Unsupported action: ${msg.action}`);
    }
  }
}
