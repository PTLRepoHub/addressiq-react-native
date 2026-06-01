import type { AddressIQConfig, AddressIQEnvironment, EnvironmentURLs } from './types';
import { AddressIQError } from './errors';

const ENVIRONMENT_URLS: Record<AddressIQEnvironment, EnvironmentURLs> = {
  production: {
    apiUrl: 'https://api.addressiqpro.com',
    ingestUrl: 'https://ingest-api.addressiqpro.com',
    privacyPolicyUrl: 'https://addressiqpro.com/privacy',
    termsUrl: 'https://addressiqpro.com/terms',
  },
  staging: {
    apiUrl: 'https://api-staging.addressiqpro.com',
    ingestUrl: 'https://ingest-api-staging.addressiqpro.com',
    privacyPolicyUrl: 'https://staging.addressiqpro.com/privacy',
    termsUrl: 'https://staging.addressiqpro.com/terms',
  },
  local: {
    apiUrl: 'http://localhost:4000',
    ingestUrl: 'http://localhost:4001',
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
  const base = ENVIRONMENT_URLS[cfg.environment ?? 'production'];
  return {
    apiUrl: cfg.apiUrl ?? base.apiUrl,
    ingestUrl: cfg.ingestUrl ?? base.ingestUrl,
    privacyPolicyUrl: base.privacyPolicyUrl,
    termsUrl: base.termsUrl,
  };
}

export function resetConfig(): void {
  _config = null;
}
