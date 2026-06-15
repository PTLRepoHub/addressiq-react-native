import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  label: string;
  tone?: 'ok' | 'warn' | 'error' | 'neutral';
}

export default function StatusChip({ label, tone = 'neutral' }: Props) {
  const palette = {
    ok: { bg: '#14532D', text: '#86EFAC' },
    warn: { bg: '#422006', text: '#FCD34D' },
    error: { bg: '#450A0A', text: '#FCA5A5' },
    neutral: { bg: '#1E3A5F', text: '#93C5FD' },
  }[tone];

  return (
    <View style={[styles.chip, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginBottom: 12 },
  text: { fontSize: 12, fontWeight: '600' },
});
