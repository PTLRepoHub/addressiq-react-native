import React from 'react';
import { View } from 'react-native';

/**
 * Icon component — lazy-loads `react-native-vector-icons/Ionicons` (the
 * bare-RN standard) and falls back to `@expo/vector-icons` (when the
 * partner happens to be on Expo). When neither is installed, renders an
 * empty placeholder of the requested size so layouts don't shift.
 *
 * Partners on bare RN should:
 *   yarn add react-native-vector-icons
 *   cd ios && pod install
 * to get the icon glyphs. The SDK doesn't bundle the font asset itself.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Ionicons: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Ionicons = require('react-native-vector-icons/Ionicons').default;
} catch {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Ionicons = require('@expo/vector-icons').Ionicons;
  } catch {
    // No icon library available — fall through to placeholder.
  }
}

const ICON_MAP = {
  // Location
  'location-pin': { set: 'ionicons', name: 'location-sharp' },
  'location-outline': { set: 'ionicons', name: 'location-outline' },
  'navigate': { set: 'ionicons', name: 'navigate' },
  'map': { set: 'ionicons', name: 'map-outline' },

  // Navigation
  'arrow-back': { set: 'ionicons', name: 'arrow-back' },
  'close': { set: 'ionicons', name: 'close' },
  'chevron-forward': { set: 'ionicons', name: 'chevron-forward' },

  // Actions
  'search': { set: 'ionicons', name: 'search' },
  'refresh': { set: 'ionicons', name: 'refresh' },
  'camera': { set: 'ionicons', name: 'camera' },
  'image': { set: 'ionicons', name: 'image-outline' },
  'trash': { set: 'ionicons', name: 'trash-outline' },

  // Status
  'checkmark': { set: 'ionicons', name: 'checkmark' },
  'checkmark-circle': { set: 'ionicons', name: 'checkmark-circle' },
  'shield-checkmark': { set: 'ionicons', name: 'shield-checkmark' },
  'alert-circle': { set: 'ionicons', name: 'alert-circle-outline' },

  // Property
  'home': { set: 'ionicons', name: 'home' },
  'home-outline': { set: 'ionicons', name: 'home-outline' },
  'business': { set: 'ionicons', name: 'business-outline' },
  'color-palette': { set: 'ionicons', name: 'color-palette-outline' },

  // Info
  'lock-closed': { set: 'ionicons', name: 'lock-closed' },
  'time': { set: 'ionicons', name: 'time-outline' },
  'ban': { set: 'ionicons', name: 'ban-outline' },
  'radio': { set: 'ionicons', name: 'radio-outline' },
  'bulb': { set: 'ionicons', name: 'bulb-outline' },
  'notifications': { set: 'ionicons', name: 'notifications-outline' },
  'settings': { set: 'ionicons', name: 'settings-outline' },
  'information-circle': { set: 'ionicons', name: 'information-circle-outline' },
} as const;

export type IconName = keyof typeof ICON_MAP;

interface Props {
  name: IconName;
  size?: number;
  color?: string;
}

export default function Icon({ name, size = 24, color = '#000' }: Props) {
  const mapping = ICON_MAP[name];
  if (!mapping || !Ionicons) {
    return <View style={{ width: size, height: size }} />;
  }
  return <Ionicons name={mapping.name} size={size} color={color} />;
}
