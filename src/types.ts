/**
 * Public types for `@addressiq/react-native` (bare workflow SDK).
 *
 * Intentionally mirrors `@addressiq/expo-react-native-sdk` where the
 * surface overlaps, so partners can choose either package without
 * rewriting their integration layer.
 */

/**
 * Which AddressIQ DEPLOYMENT the SDK talks to — i.e. which hosts.
 *
 * This is NOT the tenant's mode. Sandbox-vs-production is a property of the API
 * KEY (`aiq_test_…` resolves to a sandbox tenant server-side, `aiq_live_…` to a
 * production one) and is decided entirely by the backend on every request — the
 * SDK neither sends it nor can influence it. The axes are orthogonal: a test key
 * against the production deployment is still sandbox.
 *
 * Note `'sandbox'` is NOT a value here. Other AddressIQ SDKs used to accept it as
 * an alias for `'staging'`, which asserted that sandbox was a deployment. It is
 * not, and it is rejected everywhere.
 */
export type AddressIQDeployment = 'production' | 'staging' | 'development';

/** Resolved per-deployment URLs the SDK talks to. */
export interface DeploymentURLs {
  apiUrl: string;
  ingestUrl: string;
  /**
   * CDN base URL for the deployment. Resolved config only — the SDK does not
   * load the widget from here; the bundled asset is the only widget source.
   */
  cdnUrl: string;
  privacyPolicyUrl: string;
  termsUrl: string;
}

/** Top-level SDK config — passed once to `initialize()`. */
export interface AddressIQConfig {
  /**
   * Tenant API key (issued from the AddressIQ dashboard). This — not
   * `deployment` — decides whether the tenant is in sandbox or production mode:
   * `aiq_test_…` resolves to a sandbox App row server-side, `aiq_live_…` to a
   * production one.
   */
  apiKey: string;
  /**
   * Which DEPLOYMENT (i.e. which hosts) to target. Defaults to 'production'.
   * An unrecognised value throws.
   */
  deployment?: AddressIQDeployment;
}

/** End-user identity bound to the current SDK session via `setUser()`. */
export interface SdkUser {
  appUserId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

/** Coarse lifecycle states surfaced by `getVerificationState()`. */
export type SdkLifecycleState =
  | 'UNINITIALIZED'
  | 'IDLE'
  | 'COLLECTING'
  | 'PAUSED'
  | 'TERMINATED';

/** Detailed state snapshot returned by `getVerificationState()`. */
export interface VerificationLifecycleState {
  state: SdkLifecycleState;
  appUserId?: string;
  verificationId?: string;
  locationCode?: string;
  pausedForMs?: number;
}

/** Permission tri-state surfaced by `getPermissionState()`. */
export type PermissionStatus = 'GRANTED' | 'DENIED' | 'BLOCKED' | 'NOT_DETERMINED' | 'UNAVAILABLE';

export interface PermissionState {
  foregroundLocation: PermissionStatus;
  backgroundLocation: PermissionStatus;
  notifications: PermissionStatus;
}

/** Device capability report returned by `checkDeviceCapabilities()`. */
export interface DeviceCapabilities {
  hasGps: boolean;
  hasNetwork: boolean;
  permissions: PermissionState;
  isMockLocationDetected: boolean;
  os: 'IOS' | 'ANDROID';
  osVersion: string;
}

/** Location reading emitted by the native module. */
export interface LocationReading {
  lat: number;
  lon: number;
  accuracyM: number;
  altitudeM?: number;
  speedMps?: number;
  headingDeg?: number;
  timestampMs: number;
  isMock: boolean;
  provider?: 'gps' | 'network' | 'fused';
}

export type LocationEventType =
  | 'APP_OPEN'
  | 'BACKGROUND_CHECK'
  | 'FOREGROUND_PING'
  | 'GEOFENCE_ENTER'
  | 'GEOFENCE_EXIT';

export interface LocationEvent extends LocationReading {
  locationId?: string;
  verificationId?: string;
  eventType: LocationEventType;
  batteryLevel?: number;
  isCharging?: boolean;
  activityType?: 'STILL' | 'WALKING' | 'RUNNING' | 'IN_VEHICLE' | 'UNKNOWN';
  activityConfidence?: number;
}

/** Verification status delivered through `onStatusChange`. */
export interface VerificationResult {
  verificationId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'VERIFIED' | 'NOT_AT_ADDRESS' | 'UNKNOWN' | 'CANCELLED';
  confidence?: number;
  reason?: string;
}

export type StatusChangeCallback = (result: VerificationResult) => void;

/**
 * Tunables for `startBackgroundPinging()`. All knobs are battery-aware —
 * the SDK is signal-driven (geofence + distance-filtered updates), not
 * timer-polled, and these values shape the OS-level subscription rather
 * than a JS interval.
 */
export interface BackgroundPingingOptions {
  /**
   * Deferred-updates ceiling. The OS batches background fixes and will
   * not wake the SDK more often than this. **Lowering this does not
   * increase signal frequency — it only thins batching and drains
   * battery.** Default: 15 minutes. Do not set below 5 minutes in
   * production.
   */
  minIntervalMs?: number;
  /**
   * Movement threshold (metres). OS only emits a fix when the device
   * has moved at least this far. Default: 50m. A stationary phone
   * produces zero events regardless of `minIntervalMs`.
   */
  distanceFilterM?: number;
  /** Notification shown by the Android foreground service. */
  notificationTitle?: string;
  /** Notification body shown by the Android foreground service. */
  notificationBody?: string;
  /**
   * Native location accuracy posture. Default: `'balanced'` (city-block
   * accuracy, minimal radio use). `'high'` is for foreground reads only
   * — never pick it for background.
   */
  accuracy?: 'high' | 'balanced' | 'low';
}

/** Address payload captured by `<IQLocationManager>`. */
export interface AddressData {
  lat: number;
  lon: number;
  placeId?: string;
  formattedAddress?: string;
  propertyNumber: string;
  propertyName?: string;
  streetName: string;
  buildingColor: string;
  directions?: string;
  plusCode?: string;
  streetviewPanoId?: string;
  streetviewHeading?: number;
  streetviewLat?: number;
  streetviewLon?: number;
}

/**
 * Result returned by the `<IQLocationManager>` Collect UI on completion.
 *
 * The Collect UI **collects only** — it creates the address and returns its
 * public `locationCode`. It does NOT start a verification. Start verification
 * from this callback with `AddressIQ.startVerification({ locationCode })`
 * (contract §collect-verify split). `locationCode` is the same code the
 * imperative `start*` APIs accept.
 */
export interface CollectResult {
  locationCode: string;
  formattedAddress?: string;
  lat: number;
  lon: number;
  placeId?: string;
  /** True when the address de-duped to an existing nearby location. */
  isExisting?: boolean;
}

/**
 * Result returned by the imperative verify APIs (`startVerification` etc.).
 *
 * Uses the public codes the API returns (`verificationCode`, `locationCode`) —
 * never internal UUIDs (contract §0.2, P0-4).
 */
export interface VerifyResult {
  verificationCode: string;
  locationCode: string;
  status: string;
}

/** Args accepted by `registerGeofence()`. */
export interface GeofenceOptions {
  /** Stable identifier (typically the verificationId or locationCode). */
  identifier: string;
  /** Centre coordinate the OS monitors. */
  lat: number;
  lon: number;
  /**
   * Radius in metres. The backend assigns this adaptively per location;
   * iOS caps individual region radius around 1–2km depending on hardware,
   * and the SDK silently clamps.
   */
  radiusM: number;
  /**
   * How long the device must stay inside the fence before a DWELL event
   * fires (Android only; ignored on iOS). Default: 60_000.
   */
  loiteringDelayMs?: number;
}

/** Payload emitted by `onGeofenceTransition`. */
export interface GeofenceTransition {
  identifier: string;
  transition: 'ENTER' | 'EXIT' | 'DWELL';
  lat?: number;
  lon?: number;
  accuracyM?: number;
  radiusM?: number;
  timestampMs?: number;
}

/** Theme accepted by `<IQLocationManager>`. Full surface — partners pass `Partial<AddressIQTheme>` and the SDK fills in missing fields from `DEFAULT_THEME`. */
export interface AddressIQTheme {
  // Brand colors
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  secondaryDark: string;
  secondaryLight: string;
  accent: string;

  // Backgrounds
  background: string;
  surface: string;
  surfaceSecondary: string;
  modalOverlay: string;

  // Text
  text: string;
  textSecondary: string;
  textInverse: string;
  textLink: string;

  // Borders & dividers
  border: string;
  borderFocused: string;
  divider: string;

  // Status
  error: string;
  errorLight: string;
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  info: string;
  infoLight: string;

  // Buttons
  buttonText: string;
  buttonSecondaryText: string;
  buttonDisabledBg: string;

  // Input
  inputBg: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;

  // Card
  cardBg: string;
  cardBorder: string;

  // Typography
  fontFamily: string;
  fontFamilyMono: string;

  // Radius
  borderRadius: number;
  borderRadiusLg: number;
  borderRadiusSm: number;
}

/**
 * Props for `<IQLocationManager>` — the unified collect + verify widget.
 *
 * **Identity contract**: `appUserId` is the primary identifier — your
 * stable customer ID in your own application. Pass it to bind this
 * verification to the right customer record on the AddressIQ side.
 * `phone` and `email` are optional contact fields; the server uses
 * them for notifications + as fallback identity when `appUserId` is
 * unavailable for a particular flow.
 */
export interface IQLocationManagerProps {
  apiKey: string;
  deployment?: AddressIQDeployment;
  /**
   * Your stable identifier for the end-user (e.g. `cust_01J9P7XK`).
   * The AddressIQ backend uses this as the canonical user key for
   * dedup, push routing, and session lookup.
   */
  appUserId: string;
  /** Optional E.164 phone number — used for notifications + as fallback identity. */
  phone?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  theme?: Partial<AddressIQTheme>;
  initialAddress?: Partial<AddressData>;
  /**
   * Fired when the address is collected. The Collect UI does NOT start a
   * verification — call `AddressIQ.startVerification({ locationCode })` here to
   * begin verification (host owns when verification starts).
   */
  onComplete?: (result: CollectResult) => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
  visible?: boolean;
  /** Business display name shown on the intro/consent screens of the widget. */
  businessName?: string;
  /** Override the hosted widget bundle URL (for local development). */
  widgetUrl?: string;
}
