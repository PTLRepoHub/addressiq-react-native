import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import {
  getPermissionState,
  requestPermissions,
  shouldShowRationale,
  openSettings,
  checkDeviceCapabilities,
  getCurrentLocation,
  isBackgroundRunning,
  sync,
  AddressIQError,
} from '@addressiq/react-native';
import Button from '../components/Button';
import ResultModal from '../components/ResultModal';

interface Props {
  onBack: () => void;
}

export default function HelpersScreen({ onBack }: Props) {
  const [modal, setModal] = useState<{ title: string; payload: unknown } | null>(null);

  const run = async (title: string, fn: () => Promise<unknown>) => {
    try {
      setModal({ title, payload: await fn() });
    } catch (e) {
      const msg = e instanceof AddressIQError ? { code: e.code, message: e.message } : String(e);
      setModal({ title: `${title} — Error`, payload: msg });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Helpers Playground</Text>
      <Text style={styles.subtitle}>Permission probes + device capabilities (OkHi Helpers screen)</Text>

      <ScrollView>
        <Button label="getPermissionState" onPress={() => run('getPermissionState', getPermissionState)} />
        <Button label="requestPermissions" onPress={() => run('requestPermissions', async () => ({ granted: await requestPermissions() }))} />
        <Button label="shouldShowRationale" onPress={() => run('shouldShowRationale', shouldShowRationale)} />
        <Button label="openSettings" onPress={() => run('openSettings', async () => ({ opened: await openSettings() }))} />
        <Button label="checkDeviceCapabilities" onPress={() => run('checkDeviceCapabilities', checkDeviceCapabilities)} />
        <Button label="getCurrentLocation" onPress={() => run('getCurrentLocation', () => getCurrentLocation(true))} />
        <Button label="isBackgroundRunning" onPress={() => run('isBackgroundRunning', isBackgroundRunning)} />
        <Button label="sync (flush telemetry)" onPress={() => run('sync', sync)} />
        <Button label="Back to Hub" onPress={onBack} variant="secondary" />
      </ScrollView>

      <ResultModal
        visible={!!modal}
        title={modal?.title ?? ''}
        payload={modal?.payload}
        onClose={() => setModal(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#0a0d12' },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#94A3B8', marginBottom: 16 },
});
