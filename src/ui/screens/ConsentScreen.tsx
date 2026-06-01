import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import type { AddressIQTheme, AddressData } from '../../types';
import ScreenWrapper from '../components/ScreenWrapper';
import Button from '../components/Button';
import Icon from '../components/Icon';

interface Props {
  theme: AddressIQTheme;
  address: Partial<AddressData>;
  onSubmit: () => void;
  onBack: () => void;
  onCancel: () => void;
  submitting: boolean;
  privacyPolicyUrl?: string;
  termsUrl?: string;
}

export default function ConsentScreen({ theme, address, onSubmit, onBack, onCancel, submitting, privacyPolicyUrl, termsUrl }: Props) {
  const [consented, setConsented] = useState(false);

  return (
    <ScreenWrapper
      theme={theme}
      title="Almost done!"
      step={3}
      totalSteps={4}
      onBack={onBack}
      onClose={onCancel}
      footer={
        <Button title="Start Verification" onPress={onSubmit} theme={theme} disabled={!consented} loading={submitting} />
      }
    >
      {/* Summary */}
      <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>YOUR ADDRESS</Text>
        {address.formattedAddress && (
          <Text style={[styles.cardAddress, { color: theme.text }]}>{address.formattedAddress}</Text>
        )}
        <Text style={[styles.cardValue, { color: theme.text }]}>
          {[address.propertyNumber, address.streetName].filter(Boolean).join(' ')}
        </Text>
        {address.buildingColor && (
          <View style={styles.colorRow}>
            <Text style={[styles.colorLabel, { color: theme.textSecondary }]}>Building:</Text>
            <Text style={[styles.colorValue, { color: theme.text }]}>{address.buildingColor}</Text>
          </View>
        )}
      </View>

      {/* What happens */}
      <View style={[styles.noticeBox, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Icon name="information-circle" size={20} color="#9A3412" />
          <Text style={styles.noticeTitle}>How it works</Text>
        </View>
        <View style={styles.noticeList}>
          {[
            'We\u2019ll collect your location in the background for 2-7 days',
            'Keep your location services turned on',
            'Use your phone normally \u2014 no action needed',
            'You\u2019ll be notified when verification completes',
          ].map((text, i) => (
            <View key={i} style={styles.noticeItem}>
              <Text style={styles.noticeNumber}>{i + 1}</Text>
              <Text style={styles.noticeText}>{text}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Consent */}
      <TouchableOpacity style={styles.consentRow} onPress={() => setConsented(!consented)} activeOpacity={0.7}>
        <View style={[styles.checkbox, {
          borderColor: consented ? theme.primary : theme.border,
          backgroundColor: consented ? theme.primary : 'transparent',
        }]}>
          {consented && <Icon name="checkmark" size={16} color="#fff" />}
        </View>
        <Text style={[styles.consentText, { color: theme.text }]}>
          I agree to background location collection for address verification
          {(privacyPolicyUrl || termsUrl) ? ' and accept the ' : ''}
          {termsUrl && (
            <Text style={[styles.link, { color: theme.primary }]} onPress={() => Linking.openURL(termsUrl)}>
              Terms & Conditions
            </Text>
          )}
          {termsUrl && privacyPolicyUrl && ' and '}
          {privacyPolicyUrl && (
            <Text style={[styles.link, { color: theme.primary }]} onPress={() => Linking.openURL(privacyPolicyUrl)}>
              Privacy Policy
            </Text>
          )}
        </Text>
      </TouchableOpacity>

      {/* Policy links */}
      {(privacyPolicyUrl || termsUrl) && (
        <View style={styles.linksRow}>
          {termsUrl && (
            <TouchableOpacity onPress={() => Linking.openURL(termsUrl)} style={[styles.linkBtn, { borderColor: theme.border }]}>
              <Icon name="information-circle" size={16} color={theme.primary} />
              <Text style={[styles.linkBtnText, { color: theme.primary }]}>Terms & Conditions</Text>
            </TouchableOpacity>
          )}
          {privacyPolicyUrl && (
            <TouchableOpacity onPress={() => Linking.openURL(privacyPolicyUrl)} style={[styles.linkBtn, { borderColor: theme.border }]}>
              <Icon name="shield-checkmark" size={16} color={theme.primary} />
              <Text style={[styles.linkBtnText, { color: theme.primary }]}>Privacy Policy</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  cardAddress: { fontSize: 15, fontWeight: '600', marginBottom: 6, lineHeight: 21 },
  cardValue: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4 },
  cardCoords: { fontSize: 11, fontFamily: 'monospace' },
  colorRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  colorLabel: { fontSize: 13 },
  colorValue: { fontSize: 13, fontWeight: '600' },
  noticeBox: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 20 },
  noticeTitle: { fontSize: 15, fontWeight: '700', color: '#9A3412' },
  noticeList: { gap: 10 },
  noticeItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  noticeNumber: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FDBA74', textAlign: 'center', lineHeight: 22, fontSize: 12, fontWeight: '700', color: '#9A3412', overflow: 'hidden' },
  noticeText: { flex: 1, fontSize: 13, color: '#78350F', lineHeight: 19 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 4 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  check: { color: '#fff', fontSize: 14, fontWeight: '800' },
  consentText: { flex: 1, fontSize: 14, lineHeight: 20 },
  link: { fontWeight: '600', textDecorationLine: 'underline' },
  linksRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  linkBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
  linkBtnText: { fontSize: 12, fontWeight: '600' },
});
