/**
 * Cross-SDK §5 telemetry envelope pipeline for `@addressiq/react-native`.
 *
 * The native module emits `AddressIQLocationUpdate` and
 * `AddressIQGeofenceTransition` events to JS via `RCTDeviceEventEmitter`.
 * This module:
 *
 *   1. Subscribes to those events while a session is active.
 *   2. Packages each event into the §5 envelope (eventId UUIDv4,
 *      locationId, eventType, deviceOs, sdkVersion, deviceTimestamp, ...).
 *   3. Maintains an in-memory queue and flushes on a signal-driven
 *      threshold — queue >= BATCH_THRESHOLD OR `last flush > FLUSH_INTERVAL_MS`.
 *      Flushing happens **inside the enqueue path** (no setInterval); the
 *      check fires only when a real event arrives, so a stationary phone
 *      produces zero work.
 *   4. POSTs batches to `${ingestUrl}/v1/transit-events/batch`.
 *
 * Failure mode: on HTTP/network failure the batch is re-queued (LIFO at
 * the head) so the next signal triggers another retry. No exponential
 * back-off in JS — the OS will only emit a new event when the user
 * actually moves, which is the right cadence for retries on a mobile
 * data plan.
 */

import { getConfig, resolveUrls } from './config';
import { getNativeEmitter } from './native/bridge';
import type { LocationReading, GeofenceTransition } from './types';

const SDK_VERSION = '0.1.0';
const BATCH_THRESHOLD = 10;
const FLUSH_INTERVAL_MS = 120_000;
const STORAGE_KEY = '@addressiq/rn-telemetry-queue';
/**
 * Hard cap on queued events. Prevents storage bloat if the partner
 * leaves the SDK collecting for days without network. When the cap is
 * hit, oldest events are dropped (FIFO) — fresh events are more useful
 * for verification than stale ones.
 */
const MAX_QUEUE_SIZE = 200;

type EventType =
  | 'GEOFENCE_ENTER'
  | 'GEOFENCE_EXIT'
  | 'DWELL'
  | 'APP_OPEN'
  | 'BACKGROUND_CHECK'
  | 'ACTIVITY_UPDATE';

/** Shape sent to `POST /v1/transit-events/batch` (per docs/sdk-contract.md §5). */
interface TelemetryEnvelope {
  eventId: string;
  locationId: string;
  verificationId?: string;
  eventType: EventType;
  lat?: number;
  lon?: number;
  accuracyM?: number;
  activityType?: 'STILL' | 'WALKING' | 'RUNNING' | 'IN_VEHICLE' | 'UNKNOWN';
  activityConfidence?: number;
  batteryLevel?: number;
  isCharging?: boolean;
  deviceOs: 'IOS' | 'ANDROID';
  sdkVersion: string;
  deviceTimestamp: string;
  /** Legacy field kept for backward compat with old ingest consumers. */
  deviceTs: string;
}

let queue: TelemetryEnvelope[] = [];
let lastFlushAt = 0;
let sessionLocationId: string | null = null;
let sessionVerificationId: string | null = null;
let listenersInstalled = false;
let locationSub: { remove(): void } | null = null;
let geofenceSub: { remove(): void } | null = null;
let persistedLoaded = false;
let pendingPersist: Promise<void> | null = null;
let persistAgain = false;
let warnedNoStorage = false;

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Lazy-loads AsyncStorage. Declared as a peer dep so partners installed
 * it; if they didn't, telemetry runs in-memory only with a one-time
 * warning and events are lost on app kill. We don't throw because
 * collection itself still works — only crash-survival is affected.
 */
function loadStorage(): AsyncStorageLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-async-storage/async-storage');
    return (mod.default ?? mod) as AsyncStorageLike;
  } catch {
    if (!warnedNoStorage) {
      console.warn(
        '[AddressIQ] @react-native-async-storage/async-storage not installed — telemetry queue will not survive app kill. Install the peer dependency to enable persistence.',
      );
      warnedNoStorage = true;
    }
    return null;
  }
}

function platformOs(): 'IOS' | 'ANDROID' {
  const Platform = require('react-native').Platform as { OS: string };
  return Platform.OS === 'ios' ? 'IOS' : 'ANDROID';
}

/**
 * Generate a UUIDv4 client-side so the server's 24h Redis SETNX dedup
 * works. Prefers the platform's native `crypto.randomUUID()` (iOS 17+,
 * Hermes ≥ 0.74) and falls back to an inline RFC 4122 v4 generator.
 */
function uuidv4(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID();
  const hex = (n: number) =>
    Math.floor(Math.random() * 16 ** n)
      .toString(16)
      .padStart(n, '0');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

/**
 * Bind a verification session so subsequent native events are packaged
 * with the correct `locationId` / `verificationId`. Called automatically
 * from `startPhysical()` / `startCombined()`. Triggers a one-time load
 * of any events persisted from a previous app launch.
 */
export function setSession(locationId: string, verificationId: string | null = null): void {
  sessionLocationId = locationId;
  sessionVerificationId = verificationId;
  installListenersOnce();
  if (!persistedLoaded) {
    void loadPersistedQueue();
  }
}

/** Detach the session. Subsequent events are dropped silently. */
export function clearSession(): void {
  sessionLocationId = null;
  sessionVerificationId = null;
}

/**
 * Force-flush the in-memory queue. Returns the count successfully
 * uploaded. Backs the public `sync()` lifecycle method.
 */
export async function flushQueue(): Promise<{ flushed: number }> {
  if (queue.length === 0) return { flushed: 0 };
  const batch = queue.splice(0, queue.length);
  try {
    const { ingestUrl } = resolveUrls();
    const cfg = getConfig();
    const res = await fetch(`${ingestUrl}/v1/transit-events/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'x-sdk-name': '@addressiq/react-native',
        'x-sdk-version': SDK_VERSION,
      },
      body: JSON.stringify({ events: batch }),
    });
    if (!res.ok) {
      queue.unshift(...batch);
      void persistQueue();
      return { flushed: 0 };
    }
    lastFlushAt = Date.now();
    void persistQueue();
    return { flushed: batch.length };
  } catch {
    queue.unshift(...batch);
    void persistQueue();
    return { flushed: 0 };
  }
}

export function getQueueSize(): number {
  return queue.length;
}

/** Hard reset — drop the queue and listeners. Backs `reset()` / `logout()`. */
export function wipeTelemetry(): void {
  queue = [];
  lastFlushAt = 0;
  sessionLocationId = null;
  sessionVerificationId = null;
  locationSub?.remove();
  geofenceSub?.remove();
  locationSub = null;
  geofenceSub = null;
  listenersInstalled = false;
  persistedLoaded = false;
  const storage = loadStorage();
  if (storage) {
    void storage.removeItem(STORAGE_KEY).catch(() => undefined);
  }
}

// ── Internals ──────────────────────────────────────────────────────────

function installListenersOnce(): void {
  if (listenersInstalled) return;
  const emitter = getNativeEmitter();
  locationSub = emitter.addListener('AddressIQLocationUpdate', (raw: LocationReading) => {
    void enqueueLocation(raw);
  });
  geofenceSub = emitter.addListener('AddressIQGeofenceTransition', (raw: GeofenceTransition) => {
    void enqueueGeofence(raw);
  });
  listenersInstalled = true;
}

async function enqueueLocation(reading: LocationReading): Promise<void> {
  if (!sessionLocationId) return;
  pushBounded({
    eventId: uuidv4(),
    locationId: sessionLocationId,
    verificationId: sessionVerificationId ?? undefined,
    eventType: 'BACKGROUND_CHECK',
    lat: reading.lat,
    lon: reading.lon,
    accuracyM: reading.accuracyM,
    deviceOs: platformOs(),
    sdkVersion: SDK_VERSION,
    deviceTimestamp: new Date(reading.timestampMs).toISOString(),
    deviceTs: new Date(reading.timestampMs).toISOString(),
  });
  void persistQueue();
  await maybeFlush();
}

async function enqueueGeofence(transition: GeofenceTransition): Promise<void> {
  if (!sessionLocationId) return;
  const eventTypeMap: Record<GeofenceTransition['transition'], EventType> = {
    ENTER: 'GEOFENCE_ENTER',
    EXIT: 'GEOFENCE_EXIT',
    DWELL: 'DWELL',
  };
  const ts = transition.timestampMs ?? Date.now();
  pushBounded({
    eventId: uuidv4(),
    locationId: sessionLocationId,
    verificationId: sessionVerificationId ?? undefined,
    eventType: eventTypeMap[transition.transition],
    lat: transition.lat,
    lon: transition.lon,
    accuracyM: transition.accuracyM,
    deviceOs: platformOs(),
    sdkVersion: SDK_VERSION,
    deviceTimestamp: new Date(ts).toISOString(),
    deviceTs: new Date(ts).toISOString(),
  });
  void persistQueue();
  await maybeFlush();
}

function pushBounded(event: TelemetryEnvelope): void {
  queue.push(event);
  if (queue.length > MAX_QUEUE_SIZE) {
    // FIFO drop — oldest events are stalest, freshest are most useful.
    queue.splice(0, queue.length - MAX_QUEUE_SIZE);
  }
}

async function maybeFlush(): Promise<void> {
  const sinceLast = Date.now() - lastFlushAt;
  if (queue.length >= BATCH_THRESHOLD || sinceLast >= FLUSH_INTERVAL_MS) {
    await flushQueue();
  }
}

/**
 * Loads events persisted from a previous app launch into the in-memory
 * queue. Idempotent — sets a flag after first run so re-binding sessions
 * doesn't double-load. Crash-survival: events queued before an app kill
 * are flushed on the first signal after relaunch.
 */
async function loadPersistedQueue(): Promise<void> {
  persistedLoaded = true;
  const storage = loadStorage();
  if (!storage) return;
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    for (const event of parsed as TelemetryEnvelope[]) {
      pushBounded(event);
    }
    // Try an immediate flush — chances are the app was killed while
    // queued, network is back now.
    void flushQueue();
  } catch {
    // Corrupted JSON or storage failure — start fresh, wipe the bad key.
    await storage.removeItem(STORAGE_KEY).catch(() => undefined);
  }
}

/**
 * Persists the in-memory queue to AsyncStorage. Serialises concurrent
 * writes — if a write is already in flight, queue a follow-up write
 * after it completes so the final state always reflects the most recent
 * queue mutation. Best-effort: failures are silent and retry on next
 * mutation.
 */
async function persistQueue(): Promise<void> {
  if (pendingPersist) {
    persistAgain = true;
    return;
  }
  const storage = loadStorage();
  if (!storage) return;
  pendingPersist = (async () => {
    try {
      const snapshot = JSON.stringify(queue);
      await storage.setItem(STORAGE_KEY, snapshot);
    } catch {
      // Quota exceeded / storage corruption — drop silently; next mutation retries.
    } finally {
      pendingPersist = null;
      if (persistAgain) {
        persistAgain = false;
        void persistQueue();
      }
    }
  })();
}
