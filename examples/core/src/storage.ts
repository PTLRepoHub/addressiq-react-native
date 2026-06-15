import AsyncStorage from '@react-native-async-storage/async-storage';
import type { VerifyResult } from '@addressiq/react-native';

const KEYS = {
  loggedIn: 'aiq_logged_in',
  environment: 'aiq_environment',
  appUserId: 'aiq_app_user_id',
  firstName: 'aiq_first_name',
  lastName: 'aiq_last_name',
  email: 'aiq_email',
  phone: 'aiq_phone',
  addresses: 'aiq_verified_addresses',
} as const;

export type Environment = 'production' | 'staging' | 'local';

export interface SessionData {
  environment: Environment;
  appUserId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export async function loadSession(): Promise<SessionData | null> {
  const loggedIn = await AsyncStorage.getItem(KEYS.loggedIn);
  if (loggedIn !== 'true') return null;
  const environment = (await AsyncStorage.getItem(KEYS.environment)) as Environment | null;
  const appUserId = await AsyncStorage.getItem(KEYS.appUserId);
  if (!environment || !appUserId) return null;
  return {
    environment,
    appUserId,
    firstName: (await AsyncStorage.getItem(KEYS.firstName)) ?? '',
    lastName: (await AsyncStorage.getItem(KEYS.lastName)) ?? '',
    email: (await AsyncStorage.getItem(KEYS.email)) ?? '',
    phone: (await AsyncStorage.getItem(KEYS.phone)) ?? '',
  };
}

export async function saveSession(data: SessionData): Promise<void> {
  await AsyncStorage.multiSet([
    [KEYS.loggedIn, 'true'],
    [KEYS.environment, data.environment],
    [KEYS.appUserId, data.appUserId],
    [KEYS.firstName, data.firstName],
    [KEYS.lastName, data.lastName],
    [KEYS.email, data.email],
    [KEYS.phone, data.phone],
  ]);
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}

export async function loadAddresses(): Promise<VerifyResult[]> {
  const raw = await AsyncStorage.getItem(KEYS.addresses);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as VerifyResult[];
  } catch {
    return [];
  }
}

export async function saveAddress(result: VerifyResult): Promise<void> {
  const existing = await loadAddresses();
  const next = [result, ...existing.filter((a) => a.locationCode !== result.locationCode)].slice(0, 20);
  await AsyncStorage.setItem(KEYS.addresses, JSON.stringify(next));
}
