import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView } from 'react-native';
import { loadAddresses } from '../storage';
import type { VerifyResult } from '@addressiq/react-native';
import Button from '../components/Button';
import AddressCard from '../components/AddressCard';

interface Props {
  onBack: () => void;
  onVerify: (locationCode: string, verificationCode: string) => void;
}

export default function AddressesScreen({ onBack, onVerify }: Props) {
  const [addresses, setAddresses] = useState<VerifyResult[]>([]);

  const refresh = useCallback(async () => {
    setAddresses(await loadAddresses());
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Saved Addresses</Text>
      <Text style={styles.subtitle}>
        Tap an address to select it, or use Verify digitally to re-run digital verification (OkHi re-verify pattern).
      </Text>

      <FlatList
        data={addresses}
        keyExtractor={(item) => item.locationCode}
        ListEmptyComponent={
          <Text style={styles.empty}>No addresses yet. Use Collect Address on the verification screen.</Text>
        }
        renderItem={({ item }) => (
          <AddressCard
            item={item}
            onPress={() => onVerify(item.locationCode, item.verificationCode)}
            onVerify={() => onVerify(item.locationCode, item.verificationCode)}
          />
        )}
      />

      <Button label="Refresh" onPress={() => void refresh()} variant="secondary" />
      <Button label="Back" onPress={onBack} variant="secondary" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#0F172A' },
  title: { color: '#F8FAFC', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#94A3B8', marginBottom: 16, marginTop: 4, lineHeight: 20 },
  empty: { color: '#64748B', textAlign: 'center', marginTop: 40, lineHeight: 22 },
});
