import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import type { AddressData, IQLocationManagerProps, LocationReading, CollectResult } from '../types';
import { resolveUrls, setConfig } from '../config';
import { getNativeModule } from '../native/bridge';
import { AddressIQError } from '../errors';
import { makeIdempotencyKey } from '../idempotency';
import { resolveGoogleMapsKey } from '../maps';
import { mergeTheme } from './theme';
import LocationPermissionScreen from './screens/LocationPermissionScreen';
import AddressScreen from './screens/AddressScreen';
import StreetViewScreen from './screens/StreetViewScreen';
import PropertyDetailsScreen from './screens/PropertyDetailsScreen';
import ConsentScreen from './screens/ConsentScreen';
import SuccessScreen from './screens/SuccessScreen';

/**
 * `<IQLocationManager>` — the Collect UI widget for `@addressiq/react-native`.
 *
 * Full themed flow:
 *   loading → permission → address → details → consent → success
 *
 * **Collect only.** The widget captures and saves the address (returning its
 * `locationCode` via `onComplete`); it does NOT start a verification. The host
 * owns when verification begins — call `AddressIQ.startVerification({ locationCode })`
 * from the `onComplete` callback.
 *
 * The address step uses the Google map flow (current location / Places
 * autocomplete → auto-derived formatted address → Street View pin-confirm where
 * covered), falling back to GPS + manual entry when no Maps key is configured.
 */
type Stage = 'loading' | 'permission' | 'address' | 'streetview' | 'details' | 'consent' | 'success' | 'error';

export default function IQLocationManager(props: IQLocationManagerProps) {
  const theme = mergeTheme(props.theme);
  const [stage, setStage] = useState<Stage>('loading');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CollectResult | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [address, setAddress] = useState<Partial<AddressData>>(props.initialAddress ?? {});
  const [submitting, setSubmitting] = useState(false);

  // Reset + create session when the modal opens
  useEffect(() => {
    if (!props.visible) return;
    setConfig({
      apiKey: props.apiKey,
      environment: props.environment ?? 'production',
      googleMapsApiKey: props.googleMapsApiKey,
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
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': props.apiKey,
        // The backend rejects state-creating POSTs without an idempotency key.
        'Idempotency-Key': makeIdempotencyKey('widget_session'),
      },
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
      // Collect-only endpoint: creates the Location and returns its
      // `locationCode`. It does NOT start a verification or wire collection —
      // the host owns that via `startVerification({ locationCode })` in
      // `onComplete` (contract §collect-verify split).
      const res = await fetch(`${apiUrl}/api/v1/widget/collect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
          // The backend rejects state-creating POSTs without an idempotency key.
          'Idempotency-Key': makeIdempotencyKey('widget_collect'),
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
          plusCode: address.plusCode,
          streetviewPanoId: address.streetviewPanoId,
          streetviewLat: address.streetviewLat,
          streetviewLon: address.streetviewLon,
          streetviewHeading: address.streetviewHeading,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new AddressIQError('HTTP_ERROR', body.message || `Collect failed (${res.status})`, {
          httpStatus: res.status,
          serverPayload: body,
        });
      }
      const data = (await res.json()) as {
        locationCode: string;
        formattedAddress?: string;
        isExisting?: boolean;
      };
      const r: CollectResult = {
        locationCode: data.locationCode,
        formattedAddress: data.formattedAddress ?? address.formattedAddress,
        lat: address.lat!,
        lon: address.lon!,
        placeId: address.placeId,
        isExisting: data.isExisting,
      };
      setResult(r);
      setStage('success');

      // No collection wiring here — verification (and its geofence + background
      // collection) is started by the host from `onComplete`.
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
            googleMapsApiKey={props.googleMapsApiKey}
            onNext={(patch) => {
              updateAddress(patch);
              setStage('details');
            }}
            onStreetView={(patch) => {
              updateAddress(patch);
              setStage('streetview');
            }}
            onCancel={props.onCancel ?? (() => undefined)}
          />
        );
      case 'streetview':
        return (
          <StreetViewScreen
            theme={theme}
            apiKey={resolveGoogleMapsKey(props.googleMapsApiKey) ?? ''}
            lat={address.lat ?? 0}
            lon={address.lon ?? 0}
            onConfirm={(c) => {
              updateAddress({
                streetviewPanoId: c.panoId,
                streetviewHeading: c.heading,
                streetviewLat: c.lat,
                streetviewLon: c.lon,
              });
              setStage('details');
            }}
            onBack={() => setStage('address')}
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

  // Step indicator (P1-2): show progress through the user-facing capture
  // steps. `loading` / `success` / `error` are not numbered steps.
  const stepIndex = STEP_STAGES.indexOf(stage as (typeof STEP_STAGES)[number]);
  const body = (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {stepIndex >= 0 ? (
        <StepIndicator theme={theme} current={stepIndex} total={STEP_STAGES.length} />
      ) : null}
      {content}
    </View>
  );

  if ('visible' in props) {
    return (
      <Modal
        visible={!!props.visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={props.onCancel}
      >
        {body}
      </Modal>
    );
  }
  return body;
}

/** Ordered user-facing capture steps used by the step indicator (P1-2). */
// §6.6 canon: the 4 numbered capture steps (5–8) shown as "Step X of 4".
// Permission (step 4) is not numbered; streetview (step 6) is numbered but
// skipped when there's no Street View coverage.
const STEP_STAGES = ['address', 'streetview', 'details', 'consent'] as const;

/**
 * Slim progress indicator shown atop the Collect UI multi-step flow. Renders
 * a dot per step plus a "Step X of N" label, themed via `AddressIQTheme`.
 * Mirrored on the Flutter / iOS / Android widgets for cross-SDK parity.
 */
function StepIndicator({
  theme,
  current,
  total,
}: {
  theme: ReturnType<typeof mergeTheme>;
  current: number;
  total: number;
}) {
  return (
    <View style={stepStyles.row}>
      <View style={stepStyles.dots}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[
              stepStyles.dot,
              {
                backgroundColor: i <= current ? theme.primary : theme.border,
                width: i === current ? 20 : 8,
              },
            ]}
          />
        ))}
      </View>
      <Text style={[stepStyles.label, { color: theme.textSecondary }]}>
        Step {current + 1} of {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  muted: { fontSize: 14 },
  errorTitle: { fontSize: 20, fontWeight: '700' },
  errorMessage: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  errorRetry: { fontSize: 14, fontWeight: '600', marginTop: 8 },
});

const stepStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
  label: { fontSize: 13, fontWeight: '600' },
});
