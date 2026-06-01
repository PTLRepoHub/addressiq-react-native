import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
import type { AddressIQTheme } from '../../types';

interface Props {
  title: string;
  onPress: () => void;
  theme: AddressIQTheme;
  variant?: 'primary' | 'secondary' | 'outline' | 'text';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export default function Button({ title, onPress, theme, variant = 'primary', disabled, loading, style }: Props) {
  const isPrimary = variant === 'primary';
  const isOutline = variant === 'outline';
  const isText = variant === 'text';
  const isSecondary = variant === 'secondary';

  const bgColor = isPrimary ? theme.primary
    : isSecondary ? theme.secondaryLight
    : isOutline ? 'transparent'
    : 'transparent';

  const textColor = isPrimary ? theme.buttonText
    : isSecondary ? theme.buttonSecondaryText
    : isOutline ? theme.primary
    : theme.textLink;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        { borderRadius: theme.borderRadius, paddingVertical: 16, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: bgColor },
        isOutline && { borderWidth: 1.5, borderColor: theme.primary },
        isText && { paddingHorizontal: 8 },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? theme.buttonText : theme.primary} size="small" />
      ) : (
        <Text style={{ fontSize: 16, fontWeight: '700', color: textColor }}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}
