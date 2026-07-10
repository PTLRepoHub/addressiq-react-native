import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  initialize,
  setUser,
  startVerification,
  startPhysicalVerification,
  startDigitalAndPhysicalVerification,
  cancelVerification,
  getVerificationState,
  onStatusChange,
  isNativeLinked,
  IQLocationManager,
  AddressIQError,
  type VerifyResult,
  type CollectResult,
  type SdkLifecycleState,
} from '@addressiq/react-native';
import Button from '../components/Button';
import Card from '../components/Card';
import StatusChip from '../components/StatusChip';
import ResultModal from '../components/ResultModal';
import SettingsSheet from '../components/SettingsSheet';
import { loadAddresses, saveAddress, type SessionData } from '../storage';

type Creds = Record<
  string,
  { apiKey: string; googleMapsApiKey?: string; apiUrl?: string; businessName?: string }
>;

function loadCredentials(): Creds {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../config/credentials.json') as Creds;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../config/credentials.template.json') as Creds;
  }
}

interface Props {
  session: SessionData;
  initialLocationCode?: string;
  onOpenHelpers: () => void;
  onOpenAddresses: () => void;
  onOpenDeveloper: () => void;
  onLogout: () => void;
  onReset: () => void;
}

export default function VerificationScreen({
  session,
  initialLocationCode,
  onOpenHelpers,
  onOpenAddresses,
  onOpenDeveloper,
  onLogout,
  onReset,
}: Props) {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<SdkLifecycleState>('UNINITIALIZED');
  const [savedLocation, setSavedLocation] = useState<string>(initialLocationCode ?? '');
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<{ title: string; payload: unknown; type?: string } | null>(null);
  const activeVerification = useRef<string | null>(null);

  const creds = loadCredentials()[session.environment];
  const apiKey = creds?.apiKey ?? '';
  // Set this in credentials.json to enable the full map flow (Places
  // autocomplete + Street View). Without it the address step shows the Apple
  // Maps pin + manual entry.
  const googleMapsApiKey = creds?.googleMapsApiKey;
  // Point at a local backend for development. The Android emulator reaches the
  // host via 10.0.2.2; the iOS simulator reaches it via localhost. credentials.json
  // stores the Android form, so swap the host on iOS.
  const apiUrl =
    Platform.OS === 'ios' ? creds?.apiUrl?.replace('10.0.2.2', 'localhost') : creds?.apiUrl;
  // Fallback name only — the widget fetches the real business identity from the backend.
  const businessName = creds?.businessName;

  const refreshSaved = useCallback(async () => {
    const list = await loadAddresses();
    if (list[0] && !savedLocation) setSavedLocation(list[0].locationCode);
    if (initialLocationCode) setSavedLocation(initialLocationCode);
  }, [initialLocationCode, savedLocation]);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Pass apiUrl so the NATIVE SDK path (digital verification, status, etc.)
        // hits the same host as the widget. Without it, the `local` env defaults
        // to http://localhost:4000, which is unreachable from the Android emulator
        // (localhost = the emulator itself) → "Network request failed".
        initialize({ apiKey, environment: session.environment, apiUrl });
        await setUser({
          appUserId: session.appUserId,
          firstName: session.firstName,
          lastName: session.lastName,
          email: session.email,
          phone: session.phone,
        });
        if (!cancelled) {
          setSdkReady(true);
          setLifecycle(getVerificationState().state);
        }
      } catch (e) {
        if (!cancelled) setSdkError(e instanceof Error ? e.message : String(e));
      }
    })();
    const unsub = onStatusChange((result) => {
      setModal({ title: 'Verification update', payload: result });
      setLifecycle(getVerificationState().state);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [apiKey, session]);

  const runFlow = async (title: string, fn: () => Promise<unknown>, type?: string) => {
    setBusy(title);
    try {
      // The SDK allows ONE active verification at a time. For easy testing, if one
      // is already collecting, cancel it first so a different type can start.
      // (A production app would keep the single active verification instead.)
      if (getVerificationState().state === 'COLLECTING' && activeVerification.current) {
        try {
          await cancelVerification(activeVerification.current);
          activeVerification.current = null;
        } catch (ce) {
          // Couldn't clear the active verification — surface it plainly instead of
          // proceeding into a confusing "lifecycle is COLLECTING" error.
          setModal({
            title: `${title} — blocked`,
            payload: {
              note: 'A verification is already active and it could not be cancelled, so a new one cannot start.',
              cancelError: formatError(ce),
            },
            type,
          });
          return;
        }
      }
      const result = await fn();
      // Persist the now-verified address so it shows in the Saved Addresses list.
      const vr = result as Partial<VerifyResult>;
      if (savedLocation && vr?.verificationCode) {
        await saveAddress({ verificationCode: vr.verificationCode, locationCode: savedLocation, status: vr.status ?? 'PENDING' });
      }
      setModal({ title, payload: result, type });
      setLifecycle(getVerificationState().state);
    } catch (e) {
      setModal({ title: `${title} — Error`, payload: formatError(e), type });
      setLifecycle(getVerificationState().state);
    } finally {
      setBusy(null);
    }
  };

  const onWidgetComplete = async (result: CollectResult) => {
    setWidgetOpen(false);
    setSavedLocation(result.locationCode);
    // Collect and verify are DECOUPLED. The widget only captures the address and
    // returns a locationCode — it does NOT verify. The host decides when/how to
    // verify, so here we just save the collected address and let the user pick a
    // verification type in Step 2 below (rather than auto-starting one, which
    // would immediately put the SDK into COLLECTING).
    const collected: VerifyResult = {
      verificationCode: '',
      locationCode: result.locationCode,
      status: 'COLLECTED',
    };
    await saveAddress(collected);
    setModal({
      title: 'Address collected',
      payload: { locationCode: result.locationCode, next: 'Pick a verification below (Step 2).' },
      type: 'DIGITAL',
    });
    setLifecycle(getVerificationState().state);
  };

  const hasAddress = savedLocation.length > 0;
  const statusLabel = sdkError
    ? 'SDK error'
    : !sdkReady
      ? 'Initialising…'
      : lifecycle === 'COLLECTING'
        ? 'Collecting location'
        : isNativeLinked()
          ? 'Ready · native linked'
          : 'Ready · JS fallback';

  const statusTone = sdkError ? 'error' : !sdkReady ? 'warn' : lifecycle === 'COLLECTING' ? 'ok' : 'ok';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hi, {session.firstName || 'there'}</Text>
          <Text style={styles.env}>{session.environment}</Text>
        </View>
        <Pressable style={styles.gear} onPress={() => setSettingsOpen(true)}>
          <Text style={styles.gearIcon}>⚙</Text>
        </Pressable>
      </View>

      <StatusChip label={statusLabel} tone={statusTone} />

      <ScrollView showsVerticalScrollIndicator={false}>
        <Card
          title="Step 1 — Collect an address"
          subtitle="Opens the AddressIQ widget — intro, business consent, pick a saved address or add a new one, then verify."
        >
          <Button
            label={busy === 'Collect' ? 'Opening…' : 'Collect Address'}
            onPress={() => setWidgetOpen(true)}
            disabled={!sdkReady || !!busy}
          />
        </Card>

        <Card
          title="Step 2 — Verify address"
          subtitle={
            hasAddress
              ? `Using location ${savedLocation}`
              : 'Complete Step 1 first, or pick a saved address.'
          }
        >
          {!hasAddress ? (
            <Text style={styles.hint}>No address yet — tap Collect Address above.</Text>
          ) : (
            <>
              <Button
                label="Digital Verification"
                onPress={() =>
                  runFlow('Digital Verification', async () => {
                    const r = await startVerification({ locationCode: savedLocation });
                    activeVerification.current = r.verificationCode;
                    return r;
                  }, 'DIGITAL')
                }
                disabled={!sdkReady || !!busy}
              />
              <Button
                label="Physical Verification"
                variant="secondary"
                onPress={() =>
                  runFlow('Physical Verification', async () => {
                    const r = await startPhysicalVerification({
                      locationCode: savedLocation,
                      provider: 'internal_agents',
                    });
                    activeVerification.current = r.verificationCode;
                    return r;
                  }, 'PHYSICAL')
                }
                disabled={!sdkReady || !!busy}
              />
              <Button
                label="Digital + Physical"
                variant="secondary"
                onPress={() =>
                  runFlow('Digital + Physical', async () => {
                    const r = await startDigitalAndPhysicalVerification({
                      locationCode: savedLocation,
                      physicalProvider: 'internal_agents',
                    });
                    activeVerification.current = r.verificationCode;
                    return r;
                  }, 'COMBINED')
                }
                disabled={!sdkReady || !!busy}
              />
            </>
          )}
          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color="#818CF8" />
              <Text style={styles.busyText}>{busy}…</Text>
            </View>
          ) : null}
        </Card>

        <Card title="Tools" subtitle="Permission checks, history, and raw API explorer.">
          <Button label="Permission Helpers" variant="secondary" onPress={onOpenHelpers} />
          <Button label="Saved Addresses" variant="secondary" onPress={onOpenAddresses} />
          <Button label="Developer APIs" variant="secondary" onPress={onOpenDeveloper} />
        </Card>
      </ScrollView>

      <IQLocationManager
        visible={widgetOpen}
        apiKey={apiKey}
        googleMapsApiKey={googleMapsApiKey}
        apiUrlOverride={apiUrl}
        businessName={businessName}
        environment={session.environment}
        appUserId={session.appUserId}
        firstName={session.firstName}
        lastName={session.lastName}
        email={session.email}
        phone={session.phone}
        onComplete={onWidgetComplete}
        onCancel={() => setWidgetOpen(false)}
        onError={(e) => setModal({ title: 'Widget error', payload: formatError(e) })}
      />

      <SettingsSheet
        visible={settingsOpen}
        session={session}
        onClose={() => setSettingsOpen(false)}
        onLogout={() => {
          setSettingsOpen(false);
          onLogout();
        }}
        onReset={() => {
          setSettingsOpen(false);
          onReset();
        }}
      />

      <ResultModal
        visible={!!modal}
        title={modal?.title ?? ''}
        payload={modal?.payload}
        type={modal?.type}
        onClose={() => setModal(null)}
      />
    </SafeAreaView>
  );
}

function formatError(e: unknown): Record<string, string> {
  if (e instanceof AddressIQError) {
    return { code: e.code, message: e.message, httpStatus: String(e.httpStatus ?? '') };
  }
  return { message: e instanceof Error ? e.message : String(e) };
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  greeting: { color: '#F8FAFC', fontSize: 24, fontWeight: '700' },
  env: { color: '#64748B', fontSize: 13, marginTop: 2, textTransform: 'capitalize' },
  gear: { padding: 8 },
  gearIcon: { fontSize: 22 },
  hint: { color: '#64748B', fontSize: 14, fontStyle: 'italic' },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  busyText: { color: '#94A3B8', fontSize: 13 },
});
