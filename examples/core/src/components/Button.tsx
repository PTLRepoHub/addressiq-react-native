import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export default function Button({ label, onPress, variant = 'primary', disabled }: Props) {
  return (
    <Pressable
      style={[styles.base, styles[variant], disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { padding: 14, borderRadius: 10, marginBottom: 10 },
  primary: { backgroundColor: '#4F46E5' },
  secondary: { backgroundColor: '#334155' },
  danger: { backgroundColor: '#B91C1C' },
  disabled: { opacity: 0.5 },
  text: { color: '#fff', textAlign: 'center', fontWeight: '600', fontSize: 14 },
});
