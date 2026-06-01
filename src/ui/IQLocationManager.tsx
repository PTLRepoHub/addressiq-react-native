import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import type { AddressData, IQLocationManagerProps, LocationReading, VerifyResult } from '../types';
import { resolveUrls, setConfig } from '../config';
import { getNativeModule } from '../native/bridge';
import { AddressIQError } from '../errors';
import { setSession as setTelemetrySession, flushQueue } from '../telemetry';
import { mergeTheme } from './theme';
import LocationPermissionScreen from './screens/LocationPermissionScreen';
import AddressScreen from './screens/AddressScreen';
import PropertyDetailsScreen from './screens/PropertyDetailsScreen';
import ConsentScreen from './screens/ConsentScreen';
import SuccessScreen from './screens/SuccessScreen';

/**
 * `<IQLocationManager>` — collect + verify widget for `@addressiq/react-native`.
 *
 * Full themed flow ported from the Expo SDK:
 *   loading → permission → address → details → consent → success
 *
 * Drops Street View (which depends on react-native-webview + Google
 * Maps Street View API) and the Google Places autocomplete in
 * AddressScreen — partners on bare RN typically already have their
 * own address pickers. The address step captures GPS coordinates +
 * a free-text formatted address; the property-details step captures
 * house number, street, building color, and optional directions.
 */
type Stage = 'loading' | 'permission' | 'address' | 'details' | 'consent' | 'success' | 'error';

export default function IQLocationManager(props: IQLocationManagerProps) {
  const theme = mergeTheme(props.theme);
  const [stage, setStage] = useState<Stage>('loading');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [address, setAddress] = useState<Partial<AddressData>>(props.initialAddress ?? {});
  const [submitting, setSubmitting] = useState(false);

  // Reset + create session when the modal opens
  useEffect(() => {
    if (!props.visible) return;
    setConfig({
      apiKey: props.apiKey,
      environment: props.environment ?? 'production',
    });
    setStage('loading');
    setError(null);
    setResult(null);
    setAddress(props.initialAddress ?? {});
    setSessionToken(null);
    createSession().catch((e: Error) => {
      setError(e.message);
      setStage('error');
      props.onError?.(e);
    });
  }, [props.visible]);

  async function createSession() {
    if (!props.appUserId) throw new AddressIQError('INVALID_USER', 'appUserId is required');
    if (!props.apiKey) throw new AddressIQError('INVALID_CONFIG', 'apiKey is required');

    const { apiUrl } = resolveUrls();
    const res = await fetch(`${apiUrl}/api/v1/widget/sessions/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': props.apiKey },
      body: JSON.stringify({
        appUserId: props.appUserId,
        phone: props.phone,
        firstName: props.firstName,
        lastName: props.lastName,
        email: props.email,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new AddressIQError('HTTP_ERROR', body.message || `Session create failed (${res.status})`, {
        httpStatus: res.status,
        serverPayload: body,
      });
    }
    const data = (await res.json()) as { sessionToken: string };
    setSessionToken(data.sessionToken);
    setStage('permission');
  }

  // ── Screen callbacks bound to the SDK's native module + telemetry ──

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    const native = getNativeModule();
    const fg = await native.requestLocationPermission();
    if (!fg) return false;
    return native.requestBackgroundLocationPermission();
  }, []);

  const getCurrentLocation = useCallback(async (): Promise<LocationReading> => {
    const native = getNativeModule();
    const r = await native.getCurrentLocation(true);
    return {
      lat: r.lat,
      lon: r.lon,
      accuracyM: r.accuracyM,
      altitudeM: r.altitudeM ?? undefined,
      speedMps: r.speedMps ?? undefined,
      headingDeg: r.headingDeg ?? undefined,
      timestampMs: r.timestampMs,
      isMock: r.isMock,
      provider: (r.provider as LocationReading['provider']) ?? undefined,
    };
  }, []);

  // ── Submission ──

  async function submit() {
    if (!sessionToken) return;
    setSubmitting(true);
    try {
      const { apiUrl } = resolveUrls();
      const res = await fetch(`${apiUrl}/api/v1/widget/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          lat: address.lat,
          lon: address.lon,
          placeId: address.placeId ?? 'sdk_core_manual',
          formattedAddress: address.formattedAddress,
          propertyNumber: address.propertyNumber,
          streetName: address.streetName,
          buildingColor: address.buildingColor,
          propertyName: address.propertyName,
          directions: address.directions,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new AddressIQError('HTTP_ERROR', body.message || `Submit failed (${res.status})`, {
          httpStatus: res.status,
          serverPayload: body,
        });
      }
      const data = (await res.json()) as { verificationId: string; locationId: string; status: string };
      const r: VerifyResult = {
        verificationId: data.verificationId,
        locationId: data.locationId,
        status: data.status,
      };
      setResult(r);
      setStage('success');

      // Bind the telemetry session so subsequent native location +
      // geofence events are packaged into the §5 envelope. Flush in
      // the background so the first batch ships immediately.
      setTelemetrySession(data.locationId, data.verificationId);
      void flushQueue().catch(() => undefined);

      props.onComplete?.(r);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setStage('error');
      props.onError?.(e instanceof Error ? e : new Error(message));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ──

  const updateAddress = (patch: Partial<AddressData>) => setAddress((prev) => ({ ...prev, ...patch }));

  const content = (() => {
    if (stage === 'loading') {
      return (
        <View style={[styles.center, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.muted, { color: theme.textSecondary }]}>Setting up…</Text>
        </View>
      );
    }
    if (stage === 'error') {
      return (
        <View style={[styles.center, { backgroundColor: theme.background }]}>
          <Text style={[styles.errorTitle, { color: theme.error }]}>Something went wrong</Text>
          <Text style={[styles.errorMessage, { color: theme.text }]}>{error}</Text>
          <Text onPress={createSession} style={[styles.errorRetry, { color: theme.primary }]}>
            Tap to retry
          </Text>
        </View>
      );
    }
    switch (stage) {
      case 'permission':
        return (
          <LocationPermissionScreen
            theme={theme}
            onGranted={() => setStage('address')}
            onCancel={props.onCancel ?? (() => undefined)}
            requestPermissions={requestPermissions}
          />
        );
      case 'address':
        return (
          <AddressScreen
            theme={theme}
            initialAddress={address}
            getCurrentLocation={getCurrentLocation}
            onNext={(patch) => {
              updateAddress(patch);
              setStage('details');
            }}
            onCancel={props.onCancel ?? (() => undefined)}
          />
        );
      case 'details':
        return (
          <PropertyDetailsScreen
            theme={theme}
            address={address}
            onNext={(patch) => {
              updateAddress(patch);
              setStage('consent');
            }}
            onBack={() => setStage('address')}
            onCancel={props.onCancel ?? (() => undefined)}
          />
        );
      case 'consent':
        return (
          <ConsentScreen
            theme={theme}
            address={address}
            onSubmit={submit}
            onBack={() => setStage('details')}
            onCancel={props.onCancel ?? (() => undefined)}
            submitting={submitting}
          />
        );
      case 'success':
        return result ? (
          <SuccessScreen
            theme={theme}
            result={result}
            onDone={props.onCancel ?? (() => undefined)}
          />
        ) : null;
    }
  })();

  if ('visible' in props) {
    return (
      <Modal
        visible={!!props.visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={props.onCancel}
      >
        <View style={[styles.container, { backgroundColor: theme.background }]}>{content}</View>
      </Modal>
    );
  }
  return <View style={[styles.container, { backgroundColor: theme.background }]}>{content}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  muted: { fontSize: 14 },
  errorTitle: { fontSize: 20, fontWeight: '700' },
  errorMessage: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  errorRetry: { fontSize: 14, fontWeight: '600', marginTop: 8 },
});
