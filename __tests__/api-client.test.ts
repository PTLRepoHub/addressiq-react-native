/**
 * Unit tests for the REST client's digital-verification path. Guards P0-3 /
 * P0-4: `startVerification` must POST to the nested
 * `/locations/:code/verifications/digital` route and return the public
 * `verificationCode` (never an internal UUID). `fetch` is stubbed so the test
 * runs without a network or React Native runtime.
 */
import { setConfig, resetConfig } from '../src/config';
import { startVerification } from '../src/api';

describe('api.startVerification (digital)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    resetConfig();
    setConfig({ apiKey: 'aiq_test_key', environment: 'local' });
    fetchMock = jest.fn(async () => ({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({ verificationCode: 'ver_abc123', locationCode: 'loc_xyz789', status: 'PENDING' }),
    }));
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  afterEach(() => {
    resetConfig();
  });

  it('POSTs to the nested digital verification path', async () => {
    await startVerification({ locationCode: 'loc_xyz789', idempotencyKey: 'iqidem_rn_abc' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/v1/locations/loc_xyz789/verifications/digital');
    expect(init.method).toBe('POST');
  });

  it('defaults digitalProvider to internal_ai and forwards the idempotency key', async () => {
    await startVerification({ locationCode: 'loc_xyz789', idempotencyKey: 'iqidem_rn_abc' });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ digitalProvider: 'internal_ai' });
    expect(init.headers['idempotency-key']).toBe('iqidem_rn_abc');
    expect(init.headers['x-api-key']).toBe('aiq_test_key');
  });

  it('returns the public verificationCode, not an internal UUID', async () => {
    const result = await startVerification({ locationCode: 'loc_xyz789', idempotencyKey: 'iqidem_rn_abc' });
    expect(result.verificationCode).toBe('ver_abc123');
    expect(result.status).toBe('PENDING');
    expect(result.verificationCode).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('passes a caller-supplied digitalProvider through', async () => {
    await startVerification({
      locationCode: 'loc_xyz789',
      digitalProvider: 'dojah_digital',
      idempotencyKey: 'iqidem_rn_abc',
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ digitalProvider: 'dojah_digital' });
  });
});
