import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {
  initialize,
  setUser,
  startVerification,
  startPhysicalVerification,
  startDigitalAndPhysicalVerification,
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

function loadCredentials(): Record<string, { apiKey: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../config/credentials.json') as Record<string, { apiKey: string }>;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../config/credentials.template.json') as Record<string, { apiKey: string }>;
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

  const apiKey = loadCredentials()[session.environment]?.apiKey ?? '';

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
        initialize({ apiKey, environment: session.environment });
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
      const result = await fn();
      setModal({ title, payload: result, type });
      setLifecycle(getVerificationState().state);
    } catch (e) {
      setModal({ title: `${title} — Error`, payload: formatError(e), type });
    } finally {
      setBusy(null);
    }
  };

  const onWidgetComplete = async (result: CollectResult) => {
    setWidgetOpen(false);
    setSavedLocation(result.locationCode);
    // The Collect UI collects only — it does NOT start a verification. The host
    // owns when verification begins, so start it here from the success callback.
    try {
      const verification = await startVerification({ locationCode: result.locationCode });
      activeVerification.current = verification.verificationCode;
      const saved: VerifyResult = {
        verificationCode: verification.verificationCode,
        locationCode: result.locationCode,
        status: verification.status,
      };
      await saveAddress(saved);
      setModal({ title: 'Address collected → verification started', payload: saved, type: 'DIGITAL' });
    } catch (e) {
      setModal({ title: 'Address collected · verification failed', payload: formatError(e), type: 'DIGITAL' });
    }
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
          subtitle="Opens the AddressIQ widget. Same as OkHi's createAddress flow — capture location and property details."
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
