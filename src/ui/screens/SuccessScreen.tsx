import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import type { AddressIQTheme, VerifyResult } from '../../types';
import Button from '../components/Button';
import Icon from '../components/Icon';

/**
 * Verification-started confirmation screen for the core (bare-RN) SDK.
 *
 * Mirrors the Expo SDK's success screen but **does not register for
 * push notifications** — bare-RN partners typically already have their
 * own push setup (Firebase, OneSignal, native APNS/FCM glue). The SDK
 * exposes `getVerificationStatus()` + `onStatusChange()` so partners
 * can pipe their existing push handler into the lifecycle.
 */
interface Props {
  theme: AddressIQTheme;
  result: VerifyResult;
  onDone: () => void;
}

export default function SuccessScreen({ theme, result, onDone }: Props) {
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Animated.View style={[styles.iconCircle, { backgroundColor: theme.success, transform: [{ scale }] }]}>
          <Icon name="checkmark" size={48} color="#fff" />
        </Animated.View>

        <Animated.View style={[styles.textBlock, { opacity: fade }]}>
          <Text style={[styles.title, { color: theme.text }]}>Verification Started</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            We're now verifying your address. This typically takes 2-7 days. You'll be notified when it's complete.
          </Text>

          <View style={[styles.tipCard, { backgroundColor: theme.primaryLight }]}>
            <Icon name="bulb" size={20} color={theme.primary} />
            <Text style={[styles.tipText, { color: theme.text }]}>
              Keep your location services turned on and don't force-close this app for the best results
            </Text>
          </View>

          <Text style={[styles.refCode, { color: theme.textSecondary }]}>
            Reference: {result.verificationId}
          </Text>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <Button title="Done" onPress={onDone} theme={theme} />
        <View style={styles.branding}>
          <Icon name="shield-checkmark" size={12} color={theme.textSecondary} />
          <Text style={[styles.brandingText, { color: theme.textSecondary }]}>Powered by AddressIQ</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  iconCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  textBlock: { alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 10, letterSpacing: -0.5 },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 23, paddingHorizontal: 10, marginBottom: 28 },
  tipCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 14, width: '100%' },
  tipText: { flex: 1, fontSize: 13, lineHeight: 19 },
  refCode: { fontSize: 11, fontFamily: 'monospace', marginTop: 18 },
  footer: { padding: 20, paddingBottom: 30 },
  branding: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12 },
  brandingText: { fontSize: 11, fontWeight: '500' },
});
