import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TextInput } from 'react-native';
import {
  getVerificationStatus,
  getVerificationState,
  listProviders,
  pauseVerification,
  resumeVerification,
  cancelVerification,
  sync,
  isBackgroundRunning,
} from '@addressiq/react-native';
import Button from '../components/Button';
import ResultModal from '../components/ResultModal';

interface Props {
  defaultLocationCode?: string;
  defaultVerificationCode?: string;
  onBack: () => void;
}

/** Raw SDK surface — mirrors OkHi's JSON-debug style for integrators who need it. */
export default function DeveloperScreen({ defaultLocationCode, defaultVerificationCode, onBack }: Props) {
  const [locationCode, setLocationCode] = useState(defaultLocationCode ?? '');
  const [verificationCode, setVerificationCode] = useState(defaultVerificationCode ?? '');
  const [modal, setModal] = useState<{ title: string; payload: unknown } | null>(null);

  const run = async (title: string, fn: () => Promise<unknown>) => {
    try {
      setModal({ title, payload: await fn() });
    } catch (e) {
      setModal({ title: `${title} — Error`, payload: { message: String(e) } });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Developer APIs</Text>
      <Text style={styles.subtitle}>Low-level SDK calls with JSON results (OkHi debug style)</Text>

      <Text style={styles.label}>Location code</Text>
      <TextInput style={styles.input} value={locationCode} onChangeText={setLocationCode} placeholderTextColor="#64748B" />
      <Text style={styles.label}>Verification code</Text>
      <TextInput style={styles.input} value={verificationCode} onChangeText={setVerificationCode} placeholderTextColor="#64748B" />

      <ScrollView>
        <Button label="getVerificationState()" onPress={() => setModal({ title: 'State', payload: getVerificationState() })} variant="secondary" />
        <Button label="getVerificationStatus()" onPress={() => run('Status', () => getVerificationStatus(verificationCode || locationCode))} variant="secondary" />
        <Button label="listProviders()" onPress={() => run('Providers', () => listProviders())} variant="secondary" />
        <Button label="pauseVerification()" onPress={() => run('Pause', () => pauseVerification())} variant="secondary" />
        <Button label="resumeVerification()" onPress={() => run('Resume', () => resumeVerification())} variant="secondary" />
        <Button label="cancelVerification()" onPress={() => run('Cancel', () => cancelVerification(verificationCode || locationCode))} variant="danger" />
        <Button label="isBackgroundRunning()" onPress={() => run('Background', isBackgroundRunning)} variant="secondary" />
        <Button label="sync()" onPress={() => run('Sync', sync)} variant="secondary" />
        <Button label="← Back to Verification" onPress={onBack} />
      </ScrollView>

      <ResultModal visible={!!modal} title={modal?.title ?? ''} payload={modal?.payload} onClose={() => setModal(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#0F172A' },
  title: { color: '#F8FAFC', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#94A3B8', marginBottom: 16, marginTop: 4 },
  label: { color: '#CBD5E1', fontSize: 12, marginBottom: 4 },
  input: { backgroundColor: '#1E293B', color: '#fff', padding: 10, borderRadius: 8, marginBottom: 12 },
});
