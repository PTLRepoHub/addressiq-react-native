import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { AddressIQTheme } from '../../types';

interface Props {
  totalSteps: number;
  currentStep: number;
  theme: AddressIQTheme;
}

export default function StepIndicator({ totalSteps, currentStep, theme }: Props) {
  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i <= currentStep
              ? { backgroundColor: theme.primary, width: i === currentStep ? 24 : 8 }
              : { backgroundColor: theme.border },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  dot: { height: 8, borderRadius: 4, width: 8 },
});
