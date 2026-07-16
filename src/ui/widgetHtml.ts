import { Platform } from 'react-native';
import type { AddressIQDeployment } from '../types';
import { BUILD_WIDGET_INTEGRITY, BUILD_WIDGET_VERSION } from '../generated/buildConfig';

/**
 * How the verify WebView obtains the widget JS.
 *
 * The SRI-pinned CDN copy is the ONLY source. The SDK no longer vendors a bundled
 * widget:
 *
 *  - The widget is published to `{cdnUrl}/v{x.y.z}/iqcollect.js` — an IMMUTABLE,
 *    version-addressed path. That immutability is what makes a Subresource-
 *    Integrity pin meaningful: `BUILD_WIDGET_INTEGRITY` describes the exact bytes
 *    at that exact path. Both WKWebView (WebKit) and Android WebView (Chromium)
 *    enforce SRI, so a tampered bundle refuses to execute — not a blind "fetch and
 *    run whatever the host returns".
 *  - `development` is NOT excluded any more. It used to inline a vendored bundle
 *    and never fetch, so the CDN, the SRI check and the failure path were only
 *    ever exercised in staging/production. A dev build now loads the same pinned
 *    bundle (its `cdnUrl` resolves to the prod CDN).
 *  - There is NO fallback. A CDN outage, an offline device, or an SRI mismatch is
 *    a HARD FAILURE: `onerror` posts WIDGET_LOAD_FAILED through the
 *    ReactNativeWebView bridge so the host sees an error rather than a blank
 *    WebView.
 *  - With no usable pin we FAIL CLOSED: quietly fetching an unpinned script
 *    alongside the session config would turn a packaging bug into RCE.
 *
 * `props.widgetUrl` is a development-only override and takes precedence over the
 * CDN; it is unpinned, since a widget you are rebuilding cannot satisfy a fixed
 * hash.
 */
export const WIDGET_PIN_MISSING =
  '[AddressIQ] No CDN widget version/integrity is baked in and no `widgetUrl` ' +
  'override was supplied, so there is nothing safe to load. This is a packaging ' +
  'bug — reinstall @addressiq/react-native. The SDK ships no bundled widget and ' +
  'will not load an unpinned script from a remote host.';

/** Error code reported when the pinned CDN widget fails to load. No fallback. */
export const WIDGET_LOAD_FAILED = 'WIDGET_LOAD_FAILED';

export interface WidgetHtmlConfig {
  apiKey: string;
  apiUrl: string;
  appUserId: string;
  businessName?: string;
  /** Development-only override; wins over the CDN. Unpinned. */
  widgetUrl?: string;
  deployment?: AddressIQDeployment;
  /** Per-deployment CDN base, from `resolveUrls().cdnUrl`. */
  cdnUrl?: string;
  /** Default to the baked constants; parameters only so tests can vary them. */
  widgetVersion?: string;
  widgetIntegrity?: string;
}

/**
 * True when the baked pin allows the SRI-checked CDN load.
 *
 * `development` is no longer excluded — see the module header. It loads the same
 * pinned bundle as everything else (its `cdnUrl` resolves to the prod CDN).
 */
export function cdnWidgetEnabled(cfg: WidgetHtmlConfig): boolean {
  const version = cfg.widgetVersion ?? BUILD_WIDGET_VERSION;
  const integrity = cfg.widgetIntegrity ?? BUILD_WIDGET_INTEGRITY;
  return !!cfg.cdnUrl && !!version && !!integrity;
}

export function buildHtml(cfg: WidgetHtmlConfig): string {
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

  const version = cfg.widgetVersion ?? BUILD_WIDGET_VERSION;
  const integrity = cfg.widgetIntegrity ?? BUILD_WIDGET_INTEGRITY;

  let widgetScript: string;
  if (cfg.widgetUrl) {
    widgetScript = `<script src="${cfg.widgetUrl}"></script>`;
  } else if (cdnWidgetEnabled(cfg)) {
    // The pinned CDN copy is the ONLY source — no vendored fallback. A CDN outage,
    // an offline device, or an SRI mismatch fires onerror, which posts
    // WIDGET_LOAD_FAILED through the ReactNativeWebView bridge so the host sees an
    // error rather than a blank WebView.
    widgetScript = `<script>
  function __iqWidgetLoadFailed() {
    var msg = { kind: 'event', name: 'error', payload: {
      code: '${WIDGET_LOAD_FAILED}',
      message: 'AddressIQ: the widget could not be loaded from the CDN (outage, no '
        + 'network, or a Subresource-Integrity mismatch). The SDK ships no bundled '
        + 'copy, so there is nothing to fall back to.'
    }};
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {}
  }
</script>
<script src="${cfg.cdnUrl}/v${version}/iqcollect.js" integrity="${integrity}" crossorigin="anonymous" onerror="__iqWidgetLoadFailed()"></script>`;
  } else {
    throw new Error(WIDGET_PIN_MISSING);
  }

  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
<style>html,body{margin:0;height:100%;background:#fff}#mount{min-height:100%}</style>
</head><body>
<div id="mount"></div>
${widgetScript}
<script>
  // Guarded: if the widget failed to load, window.AddressIQ is undefined and an
  // unguarded \`new\` would throw an opaque error masking WIDGET_LOAD_FAILED.
  if (window.AddressIQ && window.AddressIQ.IQCollect) {
    var cfg = ${JSON.stringify(config)};
    var c = new window.AddressIQ.IQCollect(document.getElementById('mount'), cfg);
    c.open();
  }
</script>
</body></html>`;
}
