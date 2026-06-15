import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, SafeAreaView } from 'react-native';
import Button from '../components/Button';
import type { Environment, SessionData } from '../storage';

interface Props {
  onLogin: (session: SessionData) => void;
}

const ENVIRONMENTS: Environment[] = ['staging', 'local', 'production'];

export default function LoginScreen({ onLogin }: Props) {
  const [environment, setEnvironment] = useState<Environment>('staging');
  const [appUserId, setAppUserId] = useState(__DEV__ ? 'cust_sample_001' : '');
  const [firstName, setFirstName] = useState(__DEV__ ? 'Demo' : '');
  const [lastName, setLastName] = useState(__DEV__ ? 'User' : '');
  const [email, setEmail] = useState(__DEV__ ? 'demo@addressiq.test' : '');
  const [phone, setPhone] = useState(__DEV__ ? '+2348000000000' : '');

  const valid = appUserId.trim().length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>AddressIQ</Text>
      <Text style={styles.subtitle}>Sign in to try address collection and verification — same flow as the OkHi example login screen.</Text>

      <Text style={styles.label}>Environment</Text>
      <View style={styles.envRow}>
        {ENVIRONMENTS.map((env) => (
          <Button
            key={env}
            label={env}
            variant={environment === env ? 'primary' : 'secondary'}
            onPress={() => setEnvironment(env)}
          />
        ))}
      </View>

      <Field label="App User ID" value={appUserId} onChangeText={setAppUserId} />
      <Field label="First name" value={firstName} onChangeText={setFirstName} />
      <Field label="Last name" value={lastName} onChangeText={setLastName} />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

      <Button
        label="Continue to SDK Hub"
        onPress={() =>
          onLogin({ environment, appUserId, firstName, lastName, email, phone })
        }
        disabled={!valid}
      />
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor="#64748B"
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0a0d12' },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#94A3B8', marginBottom: 20, marginTop: 4 },
  label: { color: '#CBD5E1', fontSize: 12, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#1E293B',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  envRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
