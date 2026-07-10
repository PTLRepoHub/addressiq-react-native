import React, { useCallback, useMemo, useRef } from 'react';
import { Modal, View, StyleSheet, Linking, Platform } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { IQLocationManagerProps } from '../types';
import { resolveUrls, setConfig } from '../config';
import { getNativeModule } from '../native/bridge';
import { requestForegroundLocation } from '../index';
import { WIDGET_JS } from './widgetBundle';
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
 * There is deliberately NO default remote widget URL.
 *
 * The widget ships bundled (see `widgetBundle.ts`, generated from
 * @addressiq/iqcollect-web). If that bundle is missing the package is broken,
 * and silently fetching a script from a CDN into this WebView — alongside the
 * session config — would turn a packaging bug into remote code execution.
 * We fail closed instead.
 *
 * `props.widgetUrl` remains supported as an explicit developer override for
 * serving a local bundle during development.
 */

export default function IQLocationManager(props: IQLocationManagerProps) {
  const webRef = useRef<WebView>(null);

  const apiUrl = useMemo(() => {
    // setConfig REPLACES the global config, so forward apiUrlOverride here too —
    // otherwise opening the widget wipes the apiUrl that `initialize()` set, and
    // the native SDK path (digital verification) falls back to the localhost
    // default and fails on the Android emulator.
    setConfig({
      apiKey: props.apiKey,
      environment: props.environment ?? 'production',
      googleMapsApiKey: props.googleMapsApiKey,
      apiUrl: props.apiUrlOverride,
    });
    return props.apiUrlOverride ?? resolveUrls().apiUrl;
  }, [props.apiKey, props.environment, props.googleMapsApiKey, props.apiUrlOverride]);
  const widgetUrl = props.widgetUrl;

  const html = useMemo(
    () => buildHtml({
      apiKey: props.apiKey,
      apiUrl,
      appUserId: props.appUserId,
      businessName: props.businessName,
      widgetUrl,
    }),
    [props.apiKey, apiUrl, props.appUserId, props.businessName, widgetUrl],
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

function buildHtml(cfg: {
  apiKey: string;
  apiUrl: string;
  appUserId: string;
  businessName?: string;
  widgetUrl?: string;
}): string {
  // Business identity is fetched by the widget from the backend (tenant behind
  // the API key). Only forward a client-supplied fallback name if provided.
  const config: Record<string, unknown> = {
    apiKey: cfg.apiKey,
    apiUrl: cfg.apiUrl,
    appUserId: cfg.appUserId,
    // Drives the platform-specific "Location permission" Settings screen.
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
  if (cfg.businessName) config.business = { displayName: cfg.businessName };
  // Prefer the bundled widget (offline, version-pinned). An explicit
  // `widgetUrl` override is honoured for local development. With neither, fail
  // closed rather than reaching for a CDN — see the note on DEFAULT_WIDGET_URL.
  let widgetScript: string;
  if (WIDGET_JS) {
    widgetScript = `<script>${WIDGET_JS}</script>`;
  } else if (cfg.widgetUrl) {
    widgetScript = `<script src="${cfg.widgetUrl}"></script>`;
  } else {
    throw new Error(
      '[AddressIQ] The bundled widget (widgetBundle.ts) is empty and no `widgetUrl` ' +
      'override was supplied. This is a packaging bug — reinstall @addressiq/react-native. ' +
      'The SDK will not load the widget from a remote host.',
    );
  }
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
<style>html,body{margin:0;height:100%;background:#fff}#mount{min-height:100%}</style>
</head><body>
<div id="mount"></div>
${widgetScript}
<script>
  var cfg = ${JSON.stringify(config)};
  var c = new window.AddressIQ.IQCollect(document.getElementById('mount'), cfg);
  c.open();
</script>
</body></html>`;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
