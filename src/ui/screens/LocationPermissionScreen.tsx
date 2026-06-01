import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, Linking } from 'react-native';
import type { AddressIQTheme } from '../../types';
import ScreenWrapper from '../components/ScreenWrapper';
import Button from '../components/Button';
import Icon from '../components/Icon';

/**
 * Permission grant screen for the core (bare-RN) SDK.
 *
 * Delegates the actual permission request to a callback supplied by
 * `<IQLocationManager>`, which wires it to the SDK's `requestPermissions()`.
 * That keeps the screen decoupled from the native module bridge —
 * easier to test, easier to swap when partners customise.
 */
interface Props {
  theme: AddressIQTheme;
  onGranted: () => void;
  onCancel: () => void;
  requestPermissions: () => Promise<boolean>;
}

export default function LocationPermissionScreen({ theme, onGranted, onCancel, requestPermissions }: Props) {
  const [requesting, setRequesting] = useState(false);
  const [denied, setDenied] = useState(false);

  async function handleEnable() {
    setRequesting(true);
    try {
      const granted = await requestPermissions();
      if (!granted) {
        setDenied(true);
        return;
      }
      onGranted();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not request location permission.';
      Alert.alert('Error', message);
    } finally {
      setRequesting(false);
    }
  }

  return (
    <ScreenWrapper
      theme={theme}
      onClose={onCancel}
      scrollable={false}
      footer={
        <View>
          <Button title="Enable Location" onPress={handleEnable} theme={theme} loading={requesting} />
          {denied && (
            <Button
              title="Open Settings"
              onPress={() => Linking.openSettings()}
              theme={theme}
              variant="outline"
              style={{ marginTop: 10 }}
            />
          )}
        </View>
      }
    >
      <View style={styles.center}>
        <View style={[styles.iconCircle, { backgroundColor: theme.primaryLight }]}>
          <Icon name="location-pin" size={40} color={theme.primary} />
        </View>

        <Text style={[styles.title, { color: theme.text }]}>Enable Location</Text>

        <Text style={[styles.body, { color: theme.textSecondary }]}>
          To verify your address, we need access to your location. Please keep location services turned on during the verification period (2-7 days).
        </Text>

        {denied && (
          <View style={[styles.deniedBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
            <Text style={styles.deniedText}>
              Location permission was denied. Please go to Settings and enable location access for this app.
            </Text>
          </View>
        )}

        <View style={styles.infoList}>
          {[
            { icon: 'lock-closed' as const, text: 'Your location data is encrypted and secure' },
            { icon: 'time' as const, text: 'Location is collected periodically, not continuously' },
            { icon: 'ban' as const, text: 'You can opt out at any time' },
          ].map((item, i) => (
            <View key={i} style={[styles.infoRow, { borderColor: theme.border }]}>
              <View style={[styles.infoIconBg, { backgroundColor: theme.primaryLight }]}>
                <Icon name={item.icon} size={18} color={theme.primary} />
              </View>
              <Text style={[styles.infoText, { color: theme.text }]}>{item.text}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 12 },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22, paddingHorizontal: 10, marginBottom: 24 },
  deniedBox: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 20, width: '100%' },
  deniedText: { fontSize: 13, color: '#991B1B', textAlign: 'center', lineHeight: 20 },
  infoList: { width: '100%', gap: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', padding: 14, borderRadius: 12, borderWidth: 1 },
  infoIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoText: { fontSize: 14, flex: 1, lineHeight: 20 },
});
