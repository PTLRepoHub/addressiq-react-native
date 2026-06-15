import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';

interface Props {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export default function Card({ title, subtitle, children, style }: Props) {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  title: { color: '#F8FAFC', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#94A3B8', fontSize: 13, marginBottom: 12, lineHeight: 18 },
});
