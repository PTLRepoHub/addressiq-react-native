import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import type { AddressIQTheme } from '../../types';
import StepIndicator from './StepIndicator';
import Icon from './Icon';

interface Props {
  theme: AddressIQTheme;
  title?: string;
  subtitle?: string;
  step?: number;
  totalSteps?: number;
  onBack?: () => void;
  onClose?: () => void;
  scrollable?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function ScreenWrapper({
  theme, title, subtitle, step, totalSteps, onBack, onClose, scrollable = true, children, footer,
}: Props) {
  const Content = scrollable ? ScrollView : View;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header bar */}
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
            <Icon name="arrow-back" size={22} color={theme.text} />
          </TouchableOpacity>
        ) : <View style={styles.headerBtn} />}

        {step != null && totalSteps != null && (
          <StepIndicator totalSteps={totalSteps} currentStep={step} theme={theme} />
        )}

        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Icon name="close" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
        ) : <View style={styles.headerBtn} />}
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Content
          style={styles.flex}
          contentContainerStyle={scrollable ? styles.scrollContent : styles.flexContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {title && <Text style={[styles.title, { color: theme.text }]}>{title}</Text>}
          {subtitle && <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>}
          {children}
        </Content>

        {footer && (
          <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
            {footer}
            <View style={styles.branding}>
              <Icon name="shield-checkmark" size={12} color={theme.textSecondary} />
              <Text style={[styles.brandingText, { color: theme.textSecondary }]}>Powered by AddressIQ</Text>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4 },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  flexContent: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 6, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 24 },
  footer: { padding: 20, paddingBottom: 24, borderTopWidth: 1 },
  branding: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 14, paddingTop: 8 },
  brandingText: { fontSize: 11, fontWeight: '500', letterSpacing: 0.2 },
});
