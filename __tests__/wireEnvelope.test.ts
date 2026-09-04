import { BUILD_SDK_VERSION } from '../src/generated/buildConfig';

// `@types/node` is not a dependency of this package and the jest config scopes
// types to `jest`, so the one filesystem call is declared locally rather than
// pulling a type package in for a single test.
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};

/**
 * The transit-event envelope may only carry fields the ingest DTO declares.
 *
 * `apps/ingest` validates with `forbidNonWhitelisted: true`, so a single
 * unknown property rejects the **entire request** — and the batch endpoint
 * takes 50 events, so one stray field loses all fifty. `flushQueue()` then
 * re-queues on failure and retries the same rejected payload forever, storing
 * nothing and logging nothing.
 *
 * That is not hypothetical: this SDK shipped `verificationId` on every event
 * once a session was bound, which meant it uploaded nothing at all for the
 * entire life of a verification. The existing collection tests did not catch it
 * because they mock the telemetry module and assert only that `setSession` and
 * `flushQueue` were *called* — never what goes on the wire.
 *
 * Read from source rather than exercised through the emitter so the check needs
 * no native runtime: the failure mode is a field being *declared*, and this
 * fails the moment one is added that ingest does not accept.
 */
describe('telemetry wire envelope', () => {
  /** Mirrors TransitEventDto in apps/ingest/src/ingest/dto/transit-event.dto.ts. */
  const DTO_FIELDS = new Set([
    'locationId',
    'eventType',
    'lat',
    'lon',
    'accuracyM',
    'activityType',
    'activityConfidence',
    'batteryLevel',
    'isCharging',
    'deviceOs',
    'sdkVersion',
    'deviceTs',
    'eventId',
    'deviceTimestamp',
    'security',
    'rawPayload',
  ]);

  function declaredFields(): string[] {
    // jest runs with cwd = package root.
    const source: string = readFileSync('src/telemetry.ts', 'utf8');
    const body = source.match(/interface TelemetryEnvelope \{([\s\S]*?)\n\}/)?.[1];
    if (!body) throw new Error('TelemetryEnvelope interface not found');
    const names: string[] = [];
    for (const raw of body.split('\n')) {
      const line: string = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('*')) continue;
      const name = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\??\s*:/)?.[1];
      if (name) names.push(name);
    }
    return names;
  }

  it('declares at least the fields the server needs', () => {
    const fields = declaredFields();
    for (const required of ['eventId', 'locationId', 'eventType', 'deviceOs', 'sdkVersion']) {
      expect(fields).toContain(required);
    }
  });

  it('declares nothing the ingest DTO would reject', () => {
    const unknown = declaredFields().filter((name) => !DTO_FIELDS.has(name));
    expect(unknown).toEqual([]);
  });

  it('does not reintroduce verificationId', () => {
    // Named explicitly: the server resolves the verification from the geofence
    // registered against `locationId`, so this field is redundant as well as
    // fatal, and it is the one most likely to look useful and be added back.
    expect(declaredFields()).not.toContain('verificationId');
  });

  it('declares rawPayload, so device intelligence can reach the engine', () => {
    // Without this the SDK sends no signals at all and EMULATOR_DETECTED,
    // MOCK_LOCATION, ROOTED_DEVICE and the install-id blacklist are every one
    // of them unreachable — a compromised device scores like an honest one.
    expect(declaredFields()).toContain('rawPayload');
  });

  it('actually populates rawPayload on both enqueue paths', () => {
    // Declaring the field is not the same as sending it. Both the location and
    // the geofence path must attach it, and the earlier bug in this SDK was
    // precisely a field that existed in the type but not on the wire.
    const source: string = readFileSync('src/telemetry.ts', 'utf8');
    const attachments = source.match(/rawPayload: buildRawPayload\(/g) ?? [];
    expect(attachments.length).toBeGreaterThanOrEqual(2);
  });

  it('reports a platform-qualified sdkVersion', () => {
    // `deviceOs` is only IOS/ANDROID, which the native SDKs report too, so the
    // prefix is the only thing identifying React Native in server telemetry.
    //
    // Asserted on the built value rather than the source text: the version is
    // now baked from package.json, and a regex over the literal only ever
    // proved that someone had typed the right shape by hand.
    const source: string = readFileSync('src/telemetry.ts', 'utf8');
    expect(source).toMatch(/const SDK_VERSION = `rn\/\$\{BUILD_SDK_VERSION\}`;/);
    expect(`rn/${BUILD_SDK_VERSION}`).toMatch(/^rn\/\d+\.\d+\.\d+/);
  });
});
