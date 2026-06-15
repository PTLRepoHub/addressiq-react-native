import React from 'react';
import { Modal, View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';

interface Props {
  visible: boolean;
  title: string;
  payload: unknown;
  /** Resulting verification type — shown as a coloured chip (DIGITAL / PHYSICAL / COMBINED). */
  type?: string;
  onClose: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  DIGITAL: '#3B82F6',
  PHYSICAL: '#8B5CF6',
  COMBINED: '#14B8A6',
};

export default function ResultModal({ visible, title, payload, type, onClose }: Props) {
  const body = JSON.stringify(payload, null, 2);
  const typeColor = type ? TYPE_COLORS[type] ?? '#6B7280' : undefined;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            {type && typeColor ? (
              <View style={[styles.typeChip, { backgroundColor: `${typeColor}33`, borderColor: typeColor }]}>
                <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
                <Text style={[styles.typeText, { color: typeColor }]}>{type}</Text>
              </View>
            ) : null}
          </View>
          <ScrollView style={styles.scroll}>
            <Text style={styles.json}>{body}</Text>
          </ScrollView>
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#111827', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '80%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  typeDot: { width: 7, height: 7, borderRadius: 4 },
  typeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  scroll: { maxHeight: 400 },
  json: { color: '#CBD5E1', fontSize: 12, fontFamily: 'Menlo' },
  close: { marginTop: 16, backgroundColor: '#4F46E5', padding: 14, borderRadius: 10 },
  closeText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
});
