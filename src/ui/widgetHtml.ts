import { Platform } from 'react-native';
import type { AddressIQDeployment } from '../types';
import { BUILD_WIDGET_INTEGRITY, BUILD_WIDGET_VERSION } from '../generated/buildConfig';
import { WIDGET_JS } from './widgetBundle';

/**
 * How the verify WebView obtains the widget JS: CDN-first, integrity-pinned,
 * with the bundled copy as the fallback.
 *
 *  - The widget is published to `{cdnUrl}/v{x.y.z}/iqcollect.js` — an IMMUTABLE,
 *    version-addressed path. That immutability is what makes a Subresource-
 *    Integrity pin meaningful: `BUILD_WIDGET_INTEGRITY` describes the exact
 *    bytes at that exact path, so the CDN cannot swap them under us. Both
 *    WKWebView (WebKit) and Android WebView (Chromium) enforce SRI, so a
 *    tampered bundle refuses to execute and fires `onerror` — this is not a
 *    blind "fetch and run whatever the host returns".
 *  - The bundled widget (`WIDGET_JS`) is STILL embedded in the page as the
 *    fallback: `__iqWidgetFallback()` is defined before the remote <script> and
 *    injects it inline if the remote one fails. That covers a CDN outage, an
 *    offline device, and an SRI mismatch.
 *  - When the CDN preconditions are not met (`development`, or an unbaked
 *    version/integrity — the two are baked from the `.widget-version` /
 *    `.widget-integrity` files a web release fans out) the bundled widget is
 *    inlined directly, exactly as before.
 *  - With neither a bundle nor a usable CDN pin we FAIL CLOSED: quietly fetching
 *    an unpinned script alongside the session config would turn a packaging bug
 *    into remote code execution.
 *
 * `props.widgetUrl` remains an explicit developer override and takes precedence
 * over everything above.
 */
export const WIDGET_BUNDLE_MISSING =
  '[AddressIQ] The bundled widget (widgetBundle.ts) is empty, no CDN widget ' +
  'version/integrity is baked in, and no `widgetUrl` override was supplied. This ' +
  'is a packaging bug — reinstall @addressiq/react-native. The SDK will not load ' +
  'an unpinned script from a remote host.';

export interface WidgetHtmlConfig {
  apiKey: string;
  apiUrl: string;
  appUserId: string;
  businessName?: string;
  /** Explicit developer override; wins over the CDN and the bundle. */
  widgetUrl?: string;
  deployment?: AddressIQDeployment;
  /** Per-deployment CDN base, from `resolveUrls().cdnUrl`. */
  cdnUrl?: string;
  /** Default to the baked constants; parameters only so tests can vary them. */
  widgetVersion?: string;
  widgetIntegrity?: string;
  /** Default to the shipped bundle; a parameter only so tests can drop it. */
  bundledJs?: string;
}

/** True when the baked pin allows the SRI-checked CDN load. */
export function cdnWidgetEnabled(cfg: WidgetHtmlConfig): boolean {
  const version = cfg.widgetVersion ?? BUILD_WIDGET_VERSION;
  const integrity = cfg.widgetIntegrity ?? BUILD_WIDGET_INTEGRITY;
  // `development`'s "CDN" is the local dev host, which publishes no versioned,
  // integrity-matching bundle.
  return (
    (cfg.deployment ?? 'production') !== 'development' &&
    !!cfg.cdnUrl &&
    !!version &&
    !!integrity
  );
}

/** Escapes `</` so the bundle cannot terminate the enclosing `<script>` block. */
function scriptSafe(js: string): string {
  return js.replace(/<\//g, '<\\/');
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

  const bundledJs = cfg.bundledJs ?? WIDGET_JS;
  const version = cfg.widgetVersion ?? BUILD_WIDGET_VERSION;
  const integrity = cfg.widgetIntegrity ?? BUILD_WIDGET_INTEGRITY;

  let widgetScript: string;
  if (cfg.widgetUrl) {
    widgetScript = `<script src="${cfg.widgetUrl}"></script>`;
  } else if (cdnWidgetEnabled(cfg)) {
    const fallbackBody = bundledJs
      ? `var s = document.createElement('script');
    s.text = ${scriptSafe(JSON.stringify(bundledJs))};
    document.head.appendChild(s);`
      : `console.error('AddressIQ: widget failed to load and no bundled fallback is packaged.');`;
    widgetScript = `<script>
  function __iqWidgetFallback() {
    // The remote (SRI-pinned) widget failed to load — CDN outage, offline, or an
    // integrity mismatch. Fall back to the bundle we shipped.
    ${fallbackBody}
  }
</script>
<script src="${cfg.cdnUrl}/v${version}/iqcollect.js" integrity="${integrity}" crossorigin="anonymous" onerror="__iqWidgetFallback()"></script>`;
  } else if (bundledJs) {
    widgetScript = `<script>${scriptSafe(bundledJs)}</script>`;
  } else {
    throw new Error(WIDGET_BUNDLE_MISSING);
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
