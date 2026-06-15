import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { VerifyResult } from '@addressiq/react-native';

interface Props {
  item: VerifyResult;
  onPress: () => void;
  onVerify?: () => void;
}

export default function AddressCard({ item, onPress, onVerify }: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.address} numberOfLines={2}>
        {item.locationCode}
      </Text>
      <Text style={styles.meta}>Status: {item.status}</Text>
      <Text style={styles.meta}>Verification: {item.verificationCode}</Text>
      {onVerify ? (
        <Pressable style={styles.verifyBtn} onPress={onVerify}>
          <Text style={styles.verifyText}>Verify digitally →</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  address: { color: '#F8FAFC', fontWeight: '600', fontSize: 15 },
  meta: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  verifyBtn: { marginTop: 10, alignSelf: 'flex-start' },
  verifyText: { color: '#818CF8', fontWeight: '600', fontSize: 13 },
});
