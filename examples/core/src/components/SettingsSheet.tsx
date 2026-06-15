import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import Button from './Button';
import type { SessionData } from '../storage';

interface Props {
  visible: boolean;
  session: SessionData;
  onClose: () => void;
  onLogout: () => void;
  onReset: () => void;
}

export default function SettingsSheet({ visible, session, onClose, onLogout, onReset }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.row}>Environment: {session.environment}</Text>
          <Text style={styles.row}>User: {session.appUserId}</Text>
          <Text style={styles.row}>{session.firstName} {session.lastName}</Text>
          <View style={styles.actions}>
            <Button label="Logout" onPress={onLogout} variant="secondary" />
            <Button label="Reset SDK" onPress={onReset} variant="danger" />
            <Button label="Close" onPress={onClose} variant="secondary" />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#111827', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  row: { color: '#94A3B8', fontSize: 14, marginBottom: 6 },
  actions: { marginTop: 20 },
});
