import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { AddressIQTheme } from '../../types';
import ScreenWrapper from '../components/ScreenWrapper';
import Button from '../components/Button';

/**
 * Street View pin-confirm step. Shown only when the Street View metadata check
 * found coverage at the picked point (see `streetViewCoverage`). The user drags
 * the panorama to frame their building and confirms; we capture the pano id +
 * heading so an agent can re-orient to the same view later.
 *
 * RN has no first-party Street View widget, so this embeds Maps JS Street View
 * in a webview. `react-native-webview` is an OPTIONAL peer dependency — when it
 * isn't installed we skip straight to a plain confirm (coverage already gated).
 */
type WebViewComponent = React.ComponentType<{
  source: { html: string };
  style?: unknown;
  onMessage?: (e: { nativeEvent: { data: string } }) => void;
  javaScriptEnabled?: boolean;
}>;

let WebView: WebViewComponent | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebView = (require('react-native-webview') as { WebView: WebViewComponent }).WebView;
} catch {
  WebView = null;
}

export interface StreetViewConfirmation {
  panoId?: string;
  heading?: number;
  lat: number;
  lon: number;
}

interface Props {
  theme: AddressIQTheme;
  apiKey: string;
  lat: number;
  lon: number;
  onConfirm: (c: StreetViewConfirmation) => void;
  onBack: () => void;
  onCancel: () => void;
}

function buildHtml(apiKey: string, lat: number, lon: number): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body,#pano{height:100%;margin:0;padding:0}</style></head>
<body><div id="pano"></div>
<script>
function post(){
  try {
    var p = window.__pano;
    var pos = p.getPano ? p.getPano() : null;
    var pov = p.getPov ? p.getPov() : {heading:0};
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      panoId: pos, heading: pov.heading, lat: ${lat}, lon: ${lon}
    }));
  } catch(e) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({lat:${lat},lon:${lon}}));
  }
}
function init(){
  window.__pano = new google.maps.StreetViewPanorama(document.getElementById('pano'), {
    position: {lat: ${lat}, lng: ${lon}}, pov: {heading: 0, pitch: 0}, zoom: 1,
    addressControl: false, fullscreenControl: false, motionTracking: false, motionTrackingControl: false
  });
}
window.__confirm = post;
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=init"></script>
</body></html>`;
}

export default function StreetViewScreen({ theme, apiKey, lat, lon, onConfirm, onBack, onCancel }: Props) {
  const lastRef = React.useRef<StreetViewConfirmation>({ lat, lon });

  return (
    <ScreenWrapper
      theme={theme}
      title="Confirm your building"
      subtitle="Drag the view to frame your building, then confirm."
      onClose={onCancel}
      footer={
        <View style={styles.footerRow}>
          <View style={styles.footerBtn}>
            <Button title="Back" onPress={onBack} theme={theme} variant="outline" />
          </View>
          <View style={styles.footerBtn}>
            <Button title="Confirm" onPress={() => onConfirm(lastRef.current)} theme={theme} />
          </View>
        </View>
      }
    >
      {WebView ? (
        <View style={[styles.viewer, { borderColor: theme.border }]}>
          <WebView
            source={{ html: buildHtml(apiKey, lat, lon) }}
            javaScriptEnabled
            style={styles.webview}
            onMessage={(e) => {
              try {
                lastRef.current = { ...JSON.parse(e.nativeEvent.data), lat, lon };
              } catch {
                /* keep last */
              }
            }}
          />
        </View>
      ) : (
        <View style={[styles.fallback, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.fallbackText, { color: theme.textSecondary }]}>
            Street View preview needs react-native-webview. You can still confirm your address.
          </Text>
        </View>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  viewer: { height: 320, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  webview: { flex: 1 },
  fallback: { borderRadius: 14, borderWidth: 1, padding: 18 },
  fallbackText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  footerRow: { flexDirection: 'row', gap: 12 },
  footerBtn: { flex: 1 },
});
