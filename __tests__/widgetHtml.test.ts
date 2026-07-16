/**
 * How the verify WebView sources the widget JS.
 *
 * The SRI-pinned CDN copy is now the ONLY source — the SDK no longer vendors a
 * bundle. The tests that asserted the bundled fallback (embedded, development
 * inlines it, an unbaked pin inlines it) are inverted, not deleted.
 */
import { buildHtml, cdnWidgetEnabled, type WidgetHtmlConfig } from '../src/ui/widgetHtml';

const base: WidgetHtmlConfig = {
  apiKey: 'aiq_test',
  apiUrl: 'https://api.addressiqpro.com',
  appUserId: 'cust_1',
  deployment: 'production',
  cdnUrl: 'https://cdn.addressiqpro.com',
  widgetVersion: '0.4.0',
  widgetIntegrity: 'sha384-TESTHASH',
};

describe('buildHtml', () => {
  it('loads the SRI-pinned CDN widget', () => {
    const html = buildHtml(base);
    expect(html).toContain('<script src="https://cdn.addressiqpro.com/v0.4.0/iqcollect.js"');
    expect(html).toContain('integrity="sha384-TESTHASH"');
    expect(html).toContain('crossorigin="anonymous"');
  });

  it('development ALSO loads from the CDN — it no longer inlines a bundle', () => {
    // The inversion. development used to be excluded and inline the vendored asset.
    // (Its cdnUrl resolves to the prod CDN upstream; here we pass one explicitly.)
    const html = buildHtml({ ...base, deployment: 'development' });
    expect(html).toContain('<script src="https://cdn.addressiqpro.com/v0.4.0/iqcollect.js"');
    expect(html).toContain('integrity="sha384-TESTHASH"');
  });

  it('ships no bundled widget and no fallback machinery', () => {
    const html = buildHtml(base);
    expect(html).not.toContain('__iqWidgetFallback');
    expect(html).not.toContain('document.head.appendChild(s)');
  });

  it('reports WIDGET_LOAD_FAILED on failure instead of a blank WebView', () => {
    const html = buildHtml(base);
    expect(html).toContain('onerror="__iqWidgetLoadFailed()"');
    expect(html).toContain('WIDGET_LOAD_FAILED');
    expect(html).toContain('window.ReactNativeWebView.postMessage');
    // Defined before the remote script it guards.
    expect(html.indexOf('function __iqWidgetLoadFailed')).toBeLessThan(
      html.indexOf('<script src="https://cdn'),
    );
  });

  it('guards the boot script so a failed load does not throw over the error', () => {
    expect(buildHtml(base)).toContain('if (window.AddressIQ && window.AddressIQ.IQCollect)');
  });

  it('honours an explicit widgetUrl override above the CDN, unpinned', () => {
    const html = buildHtml({ ...base, widgetUrl: 'http://localhost:8080/iqcollect.js' });
    expect(html).toContain('<script src="http://localhost:8080/iqcollect.js"></script>');
    expect(html).not.toContain('cdn.addressiqpro.com/v0.4.0');
    expect(html).not.toContain('integrity=');
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
