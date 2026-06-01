import type { AddressIQTheme } from '../types';

export const DEFAULT_THEME: AddressIQTheme = {
  // Brand
  primary: '#4F46E5',
  primaryDark: '#4338CA',
  primaryLight: '#EEF2FF',
  secondary: '#6B7280',
  secondaryDark: '#4B5563',
  secondaryLight: '#F3F4F6',
  accent: '#8B5CF6',

  // Backgrounds
  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceSecondary: '#F3F4F6',
  modalOverlay: 'rgba(0,0,0,0.5)',

  // Text
  text: '#1F2937',
  textSecondary: '#6B7280',
  textInverse: '#FFFFFF',
  textLink: '#4F46E5',

  // Borders
  border: '#E5E7EB',
  borderFocused: '#4F46E5',
  divider: '#F3F4F6',

  // Status
  error: '#DC2626',
  errorLight: '#FEF2F2',
  success: '#16A34A',
  successLight: '#F0FDF4',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  info: '#3B82F6',
  infoLight: '#EFF6FF',

  // Buttons
  buttonText: '#FFFFFF',
  buttonSecondaryText: '#374151',
  buttonDisabledBg: '#D1D5DB',

  // Input
  inputBg: '#FFFFFF',
  inputBorder: '#D1D5DB',
  inputText: '#1F2937',
  inputPlaceholder: '#9CA3AF',

  // Card
  cardBg: '#FFFFFF',
  cardBorder: '#E5E7EB',

  // Typography
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  fontFamilyMono: 'monospace',

  // Radius
  borderRadius: 12,
  borderRadiusLg: 16,
  borderRadiusSm: 8,
};

/**
 * Merge partial theme overrides with defaults.
 * Host apps only need to provide the values they want to change.
 *
 * Smart auto-derivation: if only `primary` is provided, automatically
 * generates primaryDark, primaryLight, borderFocused, textLink from it.
 */
export function mergeTheme(overrides?: Partial<AddressIQTheme>): AddressIQTheme {
  if (!overrides) return DEFAULT_THEME;

  const merged = { ...DEFAULT_THEME, ...overrides };

  // Auto-derive related colors if only primary was overridden
  if (overrides.primary && !overrides.primaryDark) {
    merged.primaryDark = darken(overrides.primary, 15);
  }
  if (overrides.primary && !overrides.primaryLight) {
    merged.primaryLight = lighten(overrides.primary, 90);
  }
  if (overrides.primary && !overrides.borderFocused) {
    merged.borderFocused = overrides.primary;
  }
  if (overrides.primary && !overrides.textLink) {
    merged.textLink = overrides.primary;
  }

  // Auto-derive secondary variants
  if (overrides.secondary && !overrides.secondaryDark) {
    merged.secondaryDark = darken(overrides.secondary, 15);
  }
  if (overrides.secondary && !overrides.secondaryLight) {
    merged.secondaryLight = lighten(overrides.secondary, 90);
  }

  return merged;
}

// ── Color helpers ──

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

function darken(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex);
  const factor = 1 - percent / 100;
  return rgbToHex(r * factor, g * factor, b * factor);
}

function lighten(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex);
  const factor = percent / 100;
  return rgbToHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
}
