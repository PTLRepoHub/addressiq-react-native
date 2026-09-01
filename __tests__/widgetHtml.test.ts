/**
 * How the verify WebView sources the widget JS.
 *
 * The SRI-pinned CDN copy is now the ONLY source — the SDK no longer vendors a
 * bundle. The tests that asserted the bundled fallback (embedded, development
 * inlines it, an unbaked pin inlines it) are inverted, not deleted.
 */
import {
  buildHtml,
  cdnWidgetEnabled,
  WIDGET_LOAD_RETRIES,
  type WidgetHtmlConfig,
} from '../src/ui/widgetHtml';

const base: WidgetHtmlConfig = {
  apiKey: 'aiq_test',
  appUserId: 'cust_1',
  deployment: 'production',
  cdnUrl: 'https://cdn.addressiqpro.com',
  widgetVersion: '0.4.0',
  widgetIntegrity: 'sha384-TESTHASH',
};

describe('buildHtml', () => {
  it('loads the SRI-pinned CDN widget', () => {
    const html = buildHtml(base);
    // The tag is injected (see the retry tests) rather than written inline, so the
    // src and pin appear as the loader's operands.
    expect(html).toContain('"https://cdn.addressiqpro.com/v0.4.0/iqcollect.js"');
    expect(html).toContain('"sha384-TESTHASH"');
    expect(html).toContain("s.integrity = __IQ_INTEGRITY");
    expect(html).toContain("s.crossOrigin = 'anonymous'");
  });

  it('development ALSO loads from the CDN — it no longer inlines a bundle', () => {
    // The inversion. development used to be excluded and inline the vendored asset.
    // (Its cdnUrl resolves to the prod CDN upstream; here we pass one explicitly.)
    const html = buildHtml({ ...base, deployment: 'development' });
    expect(html).toContain('"https://cdn.addressiqpro.com/v0.4.0/iqcollect.js"');
    expect(html).toContain('"sha384-TESTHASH"');
  });

  it('ships no bundled widget and no unpinned fallback', () => {
    const html = buildHtml(base);
    expect(html).not.toContain('__iqWidgetFallback');
    // The loader appends a script element, but only ever the pinned one: there is
    // a single injection site and it sets `integrity` from the baked pin before
    // appending. What must not exist is a second, unpinned source to fall back to.
    expect(html.match(/document\.head\.appendChild/g)).toHaveLength(1);
    const injector = html.slice(
      html.indexOf('function __iqLoadWidget'),
      html.indexOf('document.head.appendChild'),
    );
    expect(injector).toContain('s.integrity = __IQ_INTEGRITY');
    // The only script src anywhere is the pinned one.
    expect(html.match(/\.src = /g)).toHaveLength(1);
    expect(html).not.toMatch(/<script src=/);
  });

  it('reports WIDGET_LOAD_FAILED on failure instead of a blank WebView', () => {
    const html = buildHtml(base);
    expect(html).toContain('WIDGET_LOAD_FAILED');
    expect(html).toContain('window.ReactNativeWebView.postMessage');
    expect(html).toContain('s.onerror = function ()');
    // Defined before the loader that calls it.
    expect(html.indexOf('function __iqPostFailure')).toBeLessThan(
      html.indexOf('function __iqLoadWidget'),
    );
  });

  it('retries once before giving up, so one blip does not kill the flow', () => {
    const html = buildHtml(base);
    expect(html).toContain('__iqLoadWidget(attempt + 1)');
    expect(html).toContain(`if (attempt < ${WIDGET_LOAD_RETRIES})`);
    // Retries are exhausted BEFORE the failure is reported.
    expect(html).toContain('__iqDiagnose();');
    expect(html).toContain('__iqLoadWidget(0);');
  });

  it('diagnoses the failure rather than listing all three possible causes', () => {
    const html = buildHtml(base);
    // The old message named network, outage and SRI at once and left the reader
    // to work out which — that ambiguity is the bug being fixed here.
    expect(html).not.toContain('outage, no network, or a Subresource-Integrity mismatch');
    for (const reason of [
      'NETWORK_UNREACHABLE',
      'HTTP_ERROR',
      'SRI_MISMATCH',
      'EXECUTION_ERROR',
      'UNKNOWN',
    ]) {
      expect(html).toContain(reason);
    }
    // A served-vs-pinned comparison, so a stale pin is self-evident from the error.
    expect(html).toContain("subtle.digest('SHA-384', buf)");
    expect(html).toContain('actual === __IQ_INTEGRITY');
    expect(html).toContain("'pinned ' + __IQ_INTEGRITY + ', served ' + actual");
  });

  it('boots from onload, not from a trailing inline script', () => {
    const html = buildHtml(base);
    // With the tag injected, "the script after it" no longer means "after the
    // widget is ready" — booting inline would race the (re)injected load.
    expect(html).toContain('s.onload = function () { __iqBoot(); };');
    expect(html).toContain('function __iqBoot()');
    // __iqBoot is defined in <head>, ahead of any loader that may call it.
    expect(html.indexOf('function __iqBoot')).toBeLessThan(html.indexOf('__iqLoadWidget'));
  });

  /**
   * The widget resolves its own API/ingest hosts from an ENVIRONMENT NAME
   * (`resolveEnvironmentUrls`); it never reads a URL out of its config, and an
   * absent `environment` silently defaults it to production. So a staging RN
   * build used to load the staging bundle off the staging CDN and then call the
   * PRODUCTION API — the deployment was honoured everywhere except the requests
   * that actually carry data.
   */
  it('tells the widget which environment to call', () => {
    for (const deployment of ['staging', 'production', 'development'] as const) {
      const html = buildHtml({ ...base, deployment });
      expect(html).toContain(`"environment":"${deployment}"`);
    }
  });

  it('never hands the widget a host URL — it takes an enum, not a URL', () => {
    // A URL here is silently ignored by the widget, which is exactly how the
    // production-API-from-staging bug stayed invisible.
    expect(buildHtml(base)).not.toContain('"apiUrl"');
  });

  it('guards the boot script so a failed load does not throw over the error', () => {
    expect(buildHtml(base)).toContain('if (window.AddressIQ && window.AddressIQ.IQCollect)');
  });

  it('honours an explicit widgetUrl override above the CDN, unpinned', () => {
    const html = buildHtml({ ...base, widgetUrl: 'http://localhost:8080/iqcollect.js' });
    expect(html).toContain('<script src="http://localhost:8080/iqcollect.js" onload="__iqBoot()"></script>');
    expect(html).not.toContain('cdn.addressiqpro.com/v0.4.0');
    expect(html).not.toContain('integrity');
    // No CDN loader at all on this path — nothing to retry or diagnose.
    expect(html).not.toContain('__iqLoadWidget');
  });

  it('fails closed when the pin is unbaked and there is no override', () => {
    // Previously this inlined the bundle. Now there is nothing to inline, and an
    // unpinned remote script would be RCE — so it throws.
    expect(() => buildHtml({ ...base, widgetVersion: '' })).toThrow(/packaging bug/);
    expect(() => buildHtml({ ...base, widgetIntegrity: '' })).toThrow(/packaging bug/);
  });

  it('cdnWidgetEnabled no longer excludes development', () => {
    expect(cdnWidgetEnabled({ ...base, deployment: 'development' })).toBe(true);
    expect(cdnWidgetEnabled(base)).toBe(true);
    // …but an empty pin still disables it.
    expect(cdnWidgetEnabled({ ...base, widgetVersion: '', widgetIntegrity: '' })).toBe(false);
    expect(cdnWidgetEnabled({ ...base, widgetVersion: '0.5.1', widgetIntegrity: '' })).toBe(false);
  });
});
