import { Platform } from 'react-native';
import type { AddressIQConfig, AddressIQEnvironment, EnvironmentURLs } from './types';
import { AddressIQError } from './errors';
import { BUILD_API_URL, BUILD_INGEST_URL } from './generated/buildConfig';

/**
 * Compiled-in dev backend host. Emulator-aware: the Android emulator reaches
 * the host machine's loopback via the special `10.0.2.2` alias, while the iOS
 * simulator (and everything else) uses `localhost`. A single host serves both
 * API and ingest in development.
 */
const DEV_HOST = Platform.OS === 'android' ? 'http://10.0.2.2:3355' : 'http://localhost:3355';

const ENVIRONMENT_URLS: Record<AddressIQEnvironment, EnvironmentURLs> = {
  production: {
    apiUrl: BUILD_API_URL,
    ingestUrl: BUILD_INGEST_URL,
    privacyPolicyUrl: 'https://addressiqpro.com/privacy',
    termsUrl: 'https://addressiqpro.com/terms',
  },
  staging: {
    apiUrl: 'https://api-staging.addressiqpro.com',
    ingestUrl: 'https://ingest-api-staging.addressiqpro.com',
    privacyPolicyUrl: 'https://staging.addressiqpro.com/privacy',
    termsUrl: 'https://staging.addressiqpro.com/terms',
  },
  development: {
    apiUrl: DEV_HOST,
    ingestUrl: DEV_HOST,
    privacyPolicyUrl: 'http://localhost:3000/privacy',
    termsUrl: 'http://localhost:3000/terms',
  },
};

let _config: AddressIQConfig | null = null;

export function setConfig(config: AddressIQConfig): void {
  _config = { ...config, environment: config.environment ?? 'production' };
}

export function getConfig(): AddressIQConfig {
  if (!_config) {
    throw new AddressIQError('SDK_NOT_INITIALIZED', 'SDK not initialized — call initialize() first.');
  }
  return _config;
}

export function resolveUrls(): EnvironmentURLs {
  const cfg = getConfig();
  return ENVIRONMENT_URLS[cfg.environment ?? 'production'];
}

export function resetConfig(): void {
  _config = null;
}
