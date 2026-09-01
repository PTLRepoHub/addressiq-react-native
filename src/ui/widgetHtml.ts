import { Platform } from 'react-native';
import type { AddressIQDeployment } from '../types';

/**
 * How the verify WebView obtains the widget JS.
 *
 * The SRI-pinned CDN copy is the ONLY source. The SDK no longer vendors a bundled
 * widget:
 *
 *  - The widget is published to `{cdnUrl}/v{version}/iqcollect.js` — an IMMUTABLE,
 *    version-addressed path. That immutability is what makes a Subresource-
 *    Integrity pin meaningful: `widgetIntegrity` describes the exact bytes at that
 *    exact path. Both WKWebView (WebKit) and Android WebView (Chromium) enforce
 *    SRI, so a tampered bundle refuses to execute — not a blind "fetch and run
 *    whatever the host returns".
 *  - `cdnUrl`, `widgetVersion` and `widgetIntegrity` are all PER DEPLOYMENT
 *    (resolved by `config.ts`): staging and prod publish independently and their
 *    bundles differ byte-for-byte (per-environment Maps key), so each deployment
 *    carries its own version + hash. `development` reuses the prod CDN + prod pin.
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

/**
 * Retries of the CDN load before reporting WIDGET_LOAD_FAILED.
 *
 * `onerror` fires on a transient DNS/TLS/connectivity blip exactly as it does on
 * a genuine outage, and the flow has no recovery path — a single blip on first
 * open permanently fails collect, leaving the user a Close button. One retry
 * absorbs that class without meaningfully delaying a real failure.
 */
export const WIDGET_LOAD_RETRIES = 1;

/** Backoff before the retry, ms. */
const RETRY_DELAY_MS = 400;

/**
 * Cause attributed to a load failure, carried on the error payload as `reason`.
 *
 * `onerror` itself is silent about *why* — network, HTTP status and SRI rejection
 * are indistinguishable from the event alone. That ambiguity is expensive: it
 * costs a round of manual CDN-fetching and hash-comparing to answer "is the pin
 * stale or was the phone offline?". After the retries are spent we re-fetch the
 * same URL through `fetch` (which reports status and rejects distinguishably) and,
 * when the bytes do arrive, hash them against the pin — turning the question into
 * a field the host can read.
 */
export type WidgetLoadFailureReason =
  /** `fetch` rejected: no route to the host — offline, DNS, TLS, captive portal. */
  | 'NETWORK_UNREACHABLE'
  /** The CDN answered, but not with the bundle (404 for an unpublished version…). */
  | 'HTTP_ERROR'
  /** Bytes arrived intact but their hash is not the pinned one. */
  | 'SRI_MISMATCH'
  /** Bytes arrived and match the pin — the failure was in executing them. */
  | 'EXECUTION_ERROR'
  /** The probe itself could not run (no `fetch`/`crypto.subtle`). */
  | 'UNKNOWN';

export interface WidgetHtmlConfig {
  apiKey: string;
  appUserId: string;
  businessName?: string;
  /** Development-only override; wins over the CDN. Unpinned. */
  widgetUrl?: string;
  deployment?: AddressIQDeployment;
  /** Per-deployment CDN base, from `resolveUrls().cdnUrl`. */
  cdnUrl?: string;
  /**
   * Per-deployment widget pin, from `resolveUrls().widgetVersion` /
   * `.widgetIntegrity`. There is no global default: the version + hash differ
   * between staging and prod, so the caller supplies the ones for its deployment.
   */
  widgetVersion?: string;
  widgetIntegrity?: string;
}

/**
 * True when a per-deployment pin (version + integrity) and a CDN host are all
 * present, so the SRI-checked CDN load can proceed.
 */
export function cdnWidgetEnabled(cfg: WidgetHtmlConfig): boolean {
  return !!cfg.cdnUrl && !!cfg.widgetVersion && !!cfg.widgetIntegrity;
}

export function buildHtml(cfg: WidgetHtmlConfig): string {
  // Business identity is fetched by the widget from the backend (tenant behind
  // the API key). Only forward a client-supplied fallback name if provided.
  const config: Record<string, unknown> = {
    apiKey: cfg.apiKey,
    // The widget resolves its OWN API/ingest hosts from this enum
    // (`resolveEnvironmentUrls`) and never reads a URL from its config — the
    // integrator passes a name, not a host. Omitting it defaults the widget to
    // `production`, which is how a staging RN build ended up loading the staging
    // bundle from the staging CDN and then calling the PRODUCTION API.
    environment: cfg.deployment ?? 'production',
    appUserId: cfg.appUserId,
    // Drives the platform-specific "Location permission" Settings screen.
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
  if (cfg.businessName) config.business = { displayName: cfg.businessName };

  const version = cfg.widgetVersion;
  const integrity = cfg.widgetIntegrity;

  let widgetScript: string;
  if (cfg.widgetUrl) {
    widgetScript = `<script src="${cfg.widgetUrl}" onload="__iqBoot()"></script>`;
  } else if (cdnWidgetEnabled(cfg)) {
    // The pinned CDN copy is the ONLY source — no vendored fallback. A CDN outage,
    // an offline device, or an SRI mismatch is still a hard failure; it is now
    // retried once and, when it does fail, diagnosed so the reported error names
    // the actual cause instead of listing all three.
    //
    // The tag is injected rather than written inline because a retry means loading
    // it more than once. Injection also moves the boot call to `onload`, which is
    // what makes the retry observable: the static-tag form booted from a trailing
    // inline script that ran before a re-injected tag could finish.
    const widgetSrc = `${cfg.cdnUrl}/v${version}/iqcollect.js`;
    widgetScript = `<script>
  var __IQ_SRC = ${JSON.stringify(widgetSrc)};
  var __IQ_INTEGRITY = ${JSON.stringify(integrity)};

  function __iqPostFailure(reason, detail) {
    var msg = { kind: 'event', name: 'error', payload: {
      code: '${WIDGET_LOAD_FAILED}',
      reason: reason,
      detail: detail,
      message: 'AddressIQ: the widget could not be loaded from ' + __IQ_SRC
        + ' (' + reason + (detail ? ': ' + detail : '') + '). The SDK ships no '
        + 'bundled copy, so there is nothing to fall back to.'
    }};
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {}
  }

  // \`onerror\` does not say why it fired. Re-fetch the same URL: \`fetch\` rejects
  // when the host is unreachable, exposes a status when it is not, and hands us
  // the bytes when they do arrive — at which point hashing them against the pin
  // separates a stale pin from a bundle that downloaded fine but failed to run.
  function __iqDiagnose() {
    if (typeof fetch !== 'function') return __iqPostFailure('UNKNOWN', 'fetch unavailable');
    fetch(__IQ_SRC, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) return __iqPostFailure('HTTP_ERROR', 'HTTP ' + res.status);
      var subtle = window.crypto && window.crypto.subtle;
      // crypto.subtle needs a secure context; a plain-http dev baseUrl has none.
      if (!subtle) return __iqPostFailure('UNKNOWN', 'bytes fetched; crypto.subtle unavailable to verify');
      return res.arrayBuffer().then(function (buf) {
        return subtle.digest('SHA-384', buf).then(function (d) {
          var bytes = new Uint8Array(d), bin = '';
          for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          var actual = 'sha384-' + btoa(bin);
          if (actual === __IQ_INTEGRITY) {
            __iqPostFailure('EXECUTION_ERROR', 'bytes match the pin but did not execute');
          } else {
            __iqPostFailure('SRI_MISMATCH', 'pinned ' + __IQ_INTEGRITY + ', served ' + actual);
          }
        });
      });
    }).catch(function (e) {
      __iqPostFailure('NETWORK_UNREACHABLE', (e && e.message) || String(e));
    });
  }

  function __iqLoadWidget(attempt) {
    var s = document.createElement('script');
    s.src = __IQ_SRC;
    s.integrity = __IQ_INTEGRITY;
    s.crossOrigin = 'anonymous';
    s.onload = function () { __iqBoot(); };
    s.onerror = function () {
      if (attempt < ${WIDGET_LOAD_RETRIES}) {
        setTimeout(function () { __iqLoadWidget(attempt + 1); }, ${RETRY_DELAY_MS});
      } else {
        __iqDiagnose();
      }
    };
    document.head.appendChild(s);
  }
</script>`;
  } else {
    throw new Error(WIDGET_PIN_MISSING);
  }

  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
<style>html,body{margin:0;height:100%;background:#fff}
/* viewport-fit=cover lets the page paint under the notch/status bar. Without
   these insets the widget's header — which holds the only close control on the
   first collect step — sits underneath it and is untappable. */
body{padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);box-sizing:border-box}
#mount{min-height:100%}</style>
<script>
  // Boots the widget once its script has loaded. Defined ahead of the loader so
  // it exists no matter which source won, and called from \`onload\` rather than a
  // trailing inline script — with the CDN tag injected for retries, "the script
  // after it" no longer means "after the widget is ready".
  function __iqBoot() {
    // Guarded: if the widget failed to load, window.AddressIQ is undefined and an
    // unguarded \`new\` would throw an opaque error masking WIDGET_LOAD_FAILED.
    if (window.AddressIQ && window.AddressIQ.IQCollect) {
      var cfg = ${JSON.stringify(config)};
      var c = new window.AddressIQ.IQCollect(document.getElementById('mount'), cfg);
      c.open();
    }
  }
</script>
</head><body>
<div id="mount"></div>
${widgetScript}
${cfg.widgetUrl ? '' : '<script>__iqLoadWidget(0);</script>'}
</body></html>`;
}
