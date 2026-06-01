import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import type { AddressIQTheme, AddressData } from '../../types';
import ScreenWrapper from '../components/ScreenWrapper';
import Button from '../components/Button';

interface Props {
  theme: AddressIQTheme;
  address: Partial<AddressData>;
  onNext: (address: Partial<AddressData>) => void;
  onBack: () => void;
  onCancel: () => void;
}

const COLORS = [
  { label: 'White', color: '#F5F5F5', border: true },
  { label: 'Brown', color: '#8B4513' },
  { label: 'Blue', color: '#2563EB' },
  { label: 'Red', color: '#DC2626' },
  { label: 'Grey', color: '#6B7280' },
  { label: 'Yellow', color: '#EAB308', border: true },
  { label: 'Green', color: '#16A34A' },
  { label: 'Cream', color: '#FFFDD0', border: true },
];

export default function PropertyDetailsScreen({ theme, address, onNext, onBack, onCancel }: Props) {
  const [propertyNumber, setPropertyNumber] = useState(address.propertyNumber ?? '');
  const [streetName, setStreetName] = useState(address.streetName ?? '');
  const [buildingColor, setBuildingColor] = useState(address.buildingColor ?? '');
  const [directions, setDirections] = useState(address.directions ?? '');

  const isValid = propertyNumber.trim() && streetName.trim() && buildingColor;

  return (
    <ScreenWrapper
      theme={theme}
      title="Property Details"
      subtitle="Help us identify your building"
      step={2}
      totalSteps={4}
      onBack={onBack}
      onClose={onCancel}
      footer={
        <Button
          title="Continue"
          onPress={() => onNext({
            ...address,
            propertyNumber: propertyNumber.trim(),
            streetName: streetName.trim(),
            buildingColor,
            directions: directions.trim() || undefined,
          })}
          theme={theme}
          disabled={!isValid}
        />
      }
    >
      <Text style={[styles.label, { color: theme.text }]}>Property / House Number</Text>
      <TextInput
        style={[styles.input, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]}
        value={propertyNumber}
        onChangeText={setPropertyNumber}
        placeholder="e.g. 12, Block A"
        placeholderTextColor={theme.textSecondary}
      />

      <Text style={[styles.label, { color: theme.text }]}>Street Name</Text>
      <TextInput
        style={[styles.input, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]}
        value={streetName}
        onChangeText={setStreetName}
        placeholder="e.g. Broad Street"
        placeholderTextColor={theme.textSecondary}
      />

      <Text style={[styles.label, { color: theme.text }]}>Building Color</Text>
      <View style={styles.colorGrid}>
        {COLORS.map((c) => {
          const selected = buildingColor === c.label;
          return (
            <TouchableOpacity key={c.label} onPress={() => setBuildingColor(c.label)}
              style={[styles.colorItem, selected && { borderColor: theme.primary, borderWidth: 2.5 }]}>
              <View style={[styles.colorDot, { backgroundColor: c.color }, c.border && styles.colorDotBorder]} />
              <Text style={[styles.colorLabel, { color: selected ? theme.primary : theme.textSecondary }]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.label, { color: theme.text }]}>Landmark / Directions (optional)</Text>
      <TextInput
        style={[styles.input, styles.multiline, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]}
        value={directions}
        onChangeText={setDirections}
        placeholder="e.g. Opposite yellow church"
        placeholderTextColor={theme.textSecondary}
        multiline
        numberOfLines={2}
        textAlignVertical="top"
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, marginBottom: 16 },
  multiline: { minHeight: 60, paddingTop: 13 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  colorItem: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', width: 72 },
  colorDot: { width: 32, height: 32, borderRadius: 16, marginBottom: 4 },
  colorDotBorder: { borderWidth: 1, borderColor: '#D1D5DB' },
  colorLabel: { fontSize: 11, fontWeight: '600' },
});
