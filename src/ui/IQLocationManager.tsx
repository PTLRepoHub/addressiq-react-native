import React, { useCallback, useMemo, useRef } from 'react';
import { Modal, View, StyleSheet, Linking, Platform } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { IQLocationManagerProps } from '../types';
import { resolveUrls, setConfig } from '../config';
import { getNativeModule } from '../native/bridge';
import { requestForegroundLocation } from '../index';
import { buildHtml } from './widgetHtml';
import { routeBridgeMessage } from './bridgeRouter';

/**
 * `<IQLocationManager>` — the Collect/Verify UI widget for `@addressiq/react-native`.
 *
 * The UI is now the **shared AddressIQ web widget** (single cross-platform source
 * of truth) hosted in a `WebView`. This RN shell owns only what a webview cannot:
 * the location permission prompt and the fix, bridged to the widget.
 *
 * Bridge (matches the web `HostBridge`):
 *   JS → native via `window.ReactNativeWebView.postMessage(JSON)`:
 *     { kind: 'event',   name, payload }
 *     { kind: 'request', id, action, payload }
 *   native → JS: `window.AddressIQBridge.resolve(id, result)` / `.reject(id, err)`
 */
/**
 * The widget itself is loaded CDN-first with a Subresource-Integrity pin, with
 * the bundled copy as the outage/offline fallback and a fail-closed path when
 * neither is available — see `widgetHtml.ts` for the full rationale.
 */

export default function IQLocationManager(props: IQLocationManagerProps) {
  const webRef = useRef<WebView>(null);

  const urls = useMemo(() => {
    // setConfig REPLACES the global config; re-establish it from this widget's
    // props so the native SDK path (digital verification) and the widget resolve
    // the same deployment-derived host.
    setConfig({
      apiKey: props.apiKey,
      deployment: props.deployment ?? 'production',
    });
    return resolveUrls();
  }, [props.apiKey, props.deployment]);
  const apiUrl = urls.apiUrl;
  const cdnUrl = urls.cdnUrl;
  const widgetUrl = props.widgetUrl;
  const deployment = props.deployment ?? 'production';

  const html = useMemo(
    () => buildHtml({
      apiKey: props.apiKey,
      apiUrl,
      appUserId: props.appUserId,
      businessName: props.businessName,
      widgetUrl,
      deployment,
      cdnUrl,
    }),
    [props.apiKey, apiUrl, cdnUrl, deployment, props.appUserId, props.businessName, widgetUrl],
  );

  const reply = useCallback((id: string, result: unknown, error?: unknown) => {
    const call = error !== undefined
      ? `window.AddressIQBridge && window.AddressIQBridge.reject(${JSON.stringify(id)}, ${JSON.stringify(error)});`
      : `window.AddressIQBridge && window.AddressIQBridge.resolve(${JSON.stringify(id)}, ${JSON.stringify(result)});`;
    webRef.current?.injectJavaScript(`${call} true;`);
  }, []);

  const provideLocation = useCallback(async (id: string) => {
    const native = getNativeModule();
    try {
      // A one-shot fix for address collection needs only FOREGROUND precise
      // location — NOT Always/background. Requesting background here can hang
      // when it's permanently denied, which would block the fix. Always/Precise
      // for verification tracking is requested separately when verification starts.
      await requestForegroundLocation();
      const r = await native.getCurrentLocation(true);
      reply(id, { lat: r.lat, lon: r.lon, accuracy: r.accuracyM });
    } catch (err) {
      reply(id, undefined, { code: 'LOCATION_UNAVAILABLE', message: (err as Error).message });
    }
  }, [reply]);

  // Precise-location prompt for the "Verify where you currently live" gate.
  // IMPORTANT: request FOREGROUND precise only — NOT Always/background. The
  // background request is slow (and hangs for 8s when permanently denied),
  // which made every tap take ~8s and feel like it needed multiple clicks.
  // The gate only needs precise foreground; Always is requested later, when
  // verification actually starts.
  const requestPermission = useCallback(async (id: string) => {
    try {
      await requestForegroundLocation();
      // `foreground` is FINE (precise) on Android — approximate-only reports
      // GRANTED for COARSE, which this maps to false.
      const s = await getNativeModule().getLocationPermissionStatuses();
      reply(id, { foreground: s.foreground === 'GRANTED', background: s.background === 'GRANTED' });
    } catch (err) {
      reply(id, undefined, { code: 'PERMISSION_ERROR', message: (err as Error).message });
    }
  }, [reply]);

  // Read current grant WITHOUT prompting — for the Settings screen to detect when
  // the user has toggled Always + Precise on return from the OS Settings app.
  const getPermissionState = useCallback(async (id: string) => {
    try {
      const s = await getNativeModule().getLocationPermissionStatuses();
      reply(id, { foreground: s.foreground === 'GRANTED', background: s.background === 'GRANTED' });
    } catch {
      reply(id, { foreground: false, background: false });
    }
  }, [reply]);

  const openSettings = useCallback((id: string) => {
    // Open the OS app-settings page so the user can toggle Always/Precise.
    void Linking.openSettings().catch(() => undefined);
    reply(id, true);
  }, [reply]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    routeBridgeMessage(e.nativeEvent.data, {
      onCompleted: (result) => props.onComplete?.(result),
      onCancelled: () => props.onCancel?.(),
      onFailed: (error) => props.onError?.(error),
      onLocationRequest: (id) => { void provideLocation(id); },
      onPermissionRequest: (id) => { void requestPermission(id); },
      onGetPermissionState: (id) => { void getPermissionState(id); },
      onOpenSettings: (id) => { openSettings(id); },
      // Best-effort: the native module exposes grant booleans, not a tri-state.
      permissionStatus: () => 'prompt',
      resolve: (id, value) => reply(id, value),
      reject: (id, code, message) => reply(id, undefined, { code, message }),
    });
  }, [props, reply, provideLocation, requestPermission, getPermissionState, openSettings]);

  return (
    <Modal visible={props.visible ?? true} animationType="slide" onRequestClose={props.onCancel}>
      <View style={styles.fill}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html, baseUrl: apiUrl }}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          onError={(e) => props.onError?.(new Error('WebView load error: ' + String(e.nativeEvent?.description ?? '')))}
          style={styles.fill}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
