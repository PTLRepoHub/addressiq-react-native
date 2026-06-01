// AddressIQ core React Native SDK — minimal example.
//
// Imports from `@addressiq/react-native`, linked to the LOCAL SDK in this repo
// via `file:../..`. Drop this into your own bare-RN or Expo (dev build) app.
import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Text, Pressable, StyleSheet } from 'react-native';
import {
  initialize,
  setUser,
  onStatusChange,
  getVerificationState,
  isNativeLinked,
  AddressIQError,
  type AddressIQConfig,
} from '@addressiq/react-native';

const CONFIG: AddressIQConfig = {
  apiKey: 'aiq_test_demo_bank_seed01',
  environment: 'staging',
};

export default function App() {
  const [log, setLog] = useState<string[]>([]);
  const append = (line: string) => setLog((prev) => [...prev, line]);

  useEffect(() => {
    try {
      initialize(CONFIG);
      append(`initialized (native linked: ${isNativeLinked()})`);
    } catch (e) {
      append(formatError('initialize', e));
    }
    return onStatusChange((result) => append(`status: ${JSON.stringify(result)}`));
  }, []);

  const onSetUser = async () => {
    try {
      await setUser({ appUserId: 'cust_sample_001' });
      append(`user set; lifecycle: ${getVerificationState().state}`);
    } catch (e) {
      append(formatError('setUser', e));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>AddressIQ — Core RN SDK</Text>
      <Pressable style={styles.button} onPress={onSetUser}>
        <Text style={styles.buttonText}>setUser → getVerificationState</Text>
      </Pressable>
      <ScrollView style={styles.log}>
        {log.map((line, i) => (
          <Text key={i} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatError(op: string, e: unknown): string {
  if (e instanceof AddressIQError) return `${op} error [${e.code}]: ${e.message}`;
  return `${op} error: ${String(e)}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0a0d12' },
  title: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  button: { backgroundColor: '#4F46E5', padding: 14, borderRadius: 10, marginBottom: 16 },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
  log: { flex: 1 },
  logLine: { color: '#cdd6df', fontSize: 12, marginBottom: 4 },
});
