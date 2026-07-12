/**
 * How the verify WebView sources the widget JS: CDN-first with an SRI pin,
 * bundled fallback, fail-closed when neither is available.
 */
import { buildHtml, cdnWidgetEnabled, type WidgetHtmlConfig } from '../src/ui/widgetHtml';

const BUNDLE = 'window.AddressIQ = {};';

const base: WidgetHtmlConfig = {
  apiKey: 'aiq_test',
  apiUrl: 'https://api.addressiqpro.com',
  appUserId: 'cust_1',
  environment: 'production',
  cdnUrl: 'https://cdn.addressiqpro.com',
  widgetVersion: '0.4.0',
  widgetIntegrity: 'sha384-TESTHASH',
  bundledJs: BUNDLE,
};

describe('buildHtml', () => {
  it('loads the SRI-pinned CDN widget when the preconditions are met', () => {
    const html = buildHtml(base);
    expect(html).toContain('<script src="https://cdn.addressiqpro.com/v0.4.0/iqcollect.js"');
    expect(html).toContain('integrity="sha384-TESTHASH"');
    expect(html).toContain('crossorigin="anonymous"');
    expect(html).toContain('onerror="__iqWidgetFallback()"');
  });

  it('still embeds the bundle as the outage/offline/SRI fallback', () => {
    const html = buildHtml(base);
    // The fallback is DEFINED BEFORE the remote script it guards.
    expect(html.indexOf('function __iqWidgetFallback')).toBeLessThan(
      html.indexOf('<script src="https://cdn'),
    );
    expect(html).toContain('document.head.appendChild(s)');
    expect(html).toContain('window.AddressIQ');
  });

  it('inlines the bundle and loads no remote script in development', () => {
    const html = buildHtml({ ...base, environment: 'development', cdnUrl: 'http://localhost:4000' });
    expect(html).toContain(`<script>${BUNDLE}</script>`);
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('integrity=');
  });

  it('inlines the bundle when the widget version or integrity is unbaked', () => {
    const noVersion = buildHtml({ ...base, widgetVersion: '' });
    expect(noVersion).toContain(`<script>${BUNDLE}</script>`);
    expect(noVersion).not.toContain('<script src=');

    const noIntegrity = buildHtml({ ...base, widgetIntegrity: '' });
    expect(noIntegrity).toContain(`<script>${BUNDLE}</script>`);
    expect(noIntegrity).not.toContain('integrity=');
  });

  it('honours an explicit widgetUrl override above the CDN and the bundle', () => {
    const html = buildHtml({ ...base, widgetUrl: 'http://localhost:8080/iqcollect.js' });
    expect(html).toContain('<script src="http://localhost:8080/iqcollect.js"></script>');
    expect(html).not.toContain('cdn.addressiqpro.com/v0.4.0');
  });

  it('fails closed with no bundle and no CDN pin', () => {
    expect(() => buildHtml({ ...base, bundledJs: '', widgetVersion: '' })).toThrow(
      /packaging bug/,
    );
  });

  it('is disabled by default: the widget pin is unbaked until a web release fans it out', () => {
    // BUILD_WIDGET_VERSION / BUILD_WIDGET_INTEGRITY are '' until .widget-version
    // and .widget-integrity land, so the SDK ships bundled-only today.
    const { widgetVersion: _v, widgetIntegrity: _i, ...unpinned } = base;
    expect(cdnWidgetEnabled(unpinned)).toBe(false);
    expect(cdnWidgetEnabled(base)).toBe(true);
  });
});
