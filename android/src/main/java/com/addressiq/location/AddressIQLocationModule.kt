package com.addressiq.location

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Native AddressIQ Location module — signal-driven, never polled.
 *
 * The module owns:
 *   - A `FusedLocationProviderClient` subscription started on
 *     `startBackgroundLocation()` with a `LocationRequest` that uses the
 *     supplied `distanceFilterM` as `minUpdateDistanceMeters` and
 *     `intervalMs` as the upper bound on delivery cadence.
 *   - A `GeofencingClient` registration per `registerGeofence()` call.
 *     Transitions are delivered by Play Services to
 *     [AddressIQGeofenceReceiver] which posts events back through the
 *     companion ref so we can emit via `RCTDeviceEventEmitter`.
 *   - An optional foreground service ([AddressIQLocationService]) that
 *     keeps the FusedLocation subscription alive while the host app is
 *     backgrounded. Started only on `startBackgroundLocation()` and
 *     stopped on `stopBackgroundLocation()`.
 *
 * The module deliberately does NOT spawn Handler/Timer loops. A
 * stationary device produces zero events for as long as it stays
 * stationary.
 */
class AddressIQLocationModule(private val reactCtx: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactCtx) {

  private val fusedClient = LocationServices.getFusedLocationProviderClient(reactCtx)
  private val geofencingClient: GeofencingClient = LocationServices.getGeofencingClient(reactCtx)

  private var locationCallback: LocationCallback? = null
  @Volatile private var collecting: Boolean = false

  init {
    instance = this
  }

  override fun getName() = "AddressIQLocation"

  override fun invalidate() {
    super.invalidate()
    // RN module lifecycle ends — release native resources.
    locationCallback?.let { fusedClient.removeLocationUpdates(it) }
    locationCallback = null
    collecting = false
    if (instance === this) instance = null
  }

  // ── Capability + permission probes ──────────────────────────────────

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getPlatformVersion(): String = "android-${Build.VERSION.SDK_INT}"

  @ReactMethod
  fun hasLocationPermission(promise: Promise) {
    promise.resolve(
      ContextCompat.checkSelfPermission(reactCtx, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED,
    )
  }

  /**
   * iOS has a precise/approximate accuracy toggle; on Android, FINE location IS
   * precise, so there is nothing extra to prompt — this just reports whether
   * FINE (precise) is granted. `purposeKey` is accepted for cross-platform API
   * symmetry and ignored here.
   */
  @ReactMethod
  @Suppress("UNUSED_PARAMETER") // purposeKey is iOS-only; kept for cross-platform API symmetry.
  fun requestFullAccuracy(purposeKey: String, promise: Promise) {
    promise.resolve(
      ContextCompat.checkSelfPermission(reactCtx, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED,
    )
  }

  @ReactMethod
  fun hasBackgroundLocationPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      promise.resolve(true); return
    }
    promise.resolve(
      ContextCompat.checkSelfPermission(reactCtx, Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
        PackageManager.PERMISSION_GRANTED,
    )
  }

  @ReactMethod
  fun getLocationPermissionStatuses(promise: Promise) {
    val fgGranted =
      ContextCompat.checkSelfPermission(reactCtx, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    val bgGranted = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      fgGranted
    } else {
      ContextCompat.checkSelfPermission(reactCtx, Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    }
    val map = Arguments.createMap()
    map.putString("foreground", if (fgGranted) "GRANTED" else "NOT_DETERMINED")
    map.putString("background", if (bgGranted) "GRANTED" else "NOT_DETERMINED")
    promise.resolve(map)
  }

  /**
   * The activity-bound permission prompt belongs in JS (via
   * `PermissionsAndroid`) where it can be coordinated with the host app's
   * rationale UI. The native side only reports the current grant state so
   * JS can short-circuit if already granted.
   */
  @ReactMethod
  fun requestLocationPermission(promise: Promise) {
    hasLocationPermission(promise)
  }

  @ReactMethod
  fun requestBackgroundLocationPermission(promise: Promise) {
    hasBackgroundLocationPermission(promise)
  }

  @ReactMethod
  fun isMockLocationDetected(promise: Promise) {
    // Per-reading `isMock` flag is the canonical signal; this method exists
    // for capability checks only. Production hardening (Play Integrity)
    // lives in `packages/addressiq-android` and is wired in a follow-up.
    promise.resolve(false)
  }

  /**
   * Device intelligence for the transit-event envelope.
   *
   * The scoring engine reads these out of `rawPayload` — `device.isEmulator`
   * becomes EMULATOR_DETECTED, `location.isMocked` becomes MOCK_LOCATION,
   * `security.isRooted` becomes ROOTED_DEVICE, and `fingerprint.installId`
   * keys both DEVICE_CHANGE and the device blacklist. This SDK sent none of
   * them, so on a React Native app every one of those checks was unreachable:
   * an emulator with a mocked location scored exactly like an honest phone.
   *
   * Deliberately cheap and non-authoritative. These are heuristics an attacker
   * can defeat; they exist to raise the cost, and the server treats them as
   * evidence rather than proof. Play Integrity is the hardened answer and is
   * tracked separately.
   */
  @ReactMethod
  fun collectDeviceSignals(promise: Promise) {
    val signals = Arguments.createMap()

    val device = Arguments.createMap()
    device.putBoolean("isEmulator", isProbablyEmulator())
    device.putString("model", Build.MODEL)
    device.putString("manufacturer", Build.MANUFACTURER)
    device.putString("osVersion", Build.VERSION.RELEASE)
    signals.putMap("device", device)

    val security = Arguments.createMap()
    security.putBoolean("isRooted", isProbablyRooted())
    signals.putMap("security", security)

    val fingerprint = Arguments.createMap()
    fingerprint.putString("installId", installId())
    signals.putMap("fingerprint", fingerprint)

    promise.resolve(signals)
  }

  /**
   * Emulator heuristic.
   *
   * The widely-copied version of this check tests `FINGERPRINT.startsWith
   * ("generic")`, `MODEL.contains("google_sdk")` and friends — and it does not
   * fire on a current Android Studio AVD, which reports
   * `google/sdk_gphone16k_arm64/emu64a16k` with `dev-keys`. Verified against a
   * real API 37 image: every one of those legacy predicates returns false.
   *
   * `ro.hardware` (`ranchu`/`goldfish`) and `ro.kernel.qemu` are what actually
   * hold, so they lead here. The legacy checks are kept for older images and
   * Genymotion. A determined attacker patches all of this, which is why it is
   * one signal among several rather than a gate on its own.
   */
  internal fun isProbablyEmulator(): Boolean {
    val hardware = systemProperty("ro.hardware")
    if (hardware == "ranchu" || hardware == "goldfish" || hardware == "vbox86") return true
    if (systemProperty("ro.kernel.qemu").isNotEmpty()) return true
    if (systemProperty("ro.boot.qemu") == "1") return true

    return Build.FINGERPRINT.startsWith("generic") ||
      Build.FINGERPRINT.startsWith("unknown") ||
      Build.MODEL.startsWith("sdk_") ||
      Build.PRODUCT.startsWith("sdk_") ||
      Build.DEVICE.startsWith("emu") ||
      Build.MODEL.contains("google_sdk") ||
      Build.MODEL.contains("Emulator") ||
      Build.MODEL.contains("Android SDK built for") ||
      Build.MANUFACTURER.contains("Genymotion") ||
      (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic")) ||
      "google_sdk" == Build.PRODUCT
  }

  /**
   * Read a system property reflectively.
   *
   * `android.os.SystemProperties` is hidden API, so this is the supported way
   * to reach `ro.hardware` and `ro.kernel.qemu` — the two properties that
   * actually identify a modern emulator. Returns "" on any failure, which the
   * caller treats as "not observed" rather than "not an emulator".
   */
  internal fun systemProperty(key: String): String = runCatching {
    @Suppress("PrivateApi")
    val clazz = Class.forName("android.os.SystemProperties")
    val get = clazz.getMethod("get", String::class.java)
    (get.invoke(null, key) as? String).orEmpty()
  }.getOrDefault("")

  /** Presence of a superuser binary or a test-keys build. */
  internal fun isProbablyRooted(): Boolean {
    if (Build.TAGS?.contains("test-keys") == true) return true
    val paths = arrayOf(
      "/system/app/Superuser.apk",
      "/sbin/su",
      "/system/bin/su",
      "/system/xbin/su",
      "/data/local/xbin/su",
      "/data/local/bin/su",
      "/system/sd/xbin/su",
      "/system/bin/failsafe/su",
      "/data/local/su",
      "/su/bin/su",
    )
    return paths.any { runCatching { java.io.File(it).exists() }.getOrDefault(false) }
  }

  /**
   * A per-install identifier, generated once and kept in the app's private
   * prefs. Not a hardware id: it dies with the install, which is exactly the
   * privacy property we want — it links a device across a verification without
   * being a durable cross-app identifier.
   */
  internal fun installId(): String {
    val prefs = reactApplicationContext
      .getSharedPreferences("addressiq_sdk", Context.MODE_PRIVATE)
    prefs.getString("installId", null)?.let { return it }
    val generated = java.util.UUID.randomUUID().toString()
    prefs.edit().putString("installId", generated).apply()
    return generated
  }

  // ── Foreground reading ──────────────────────────────────────────────

  @ReactMethod
  fun getCurrentLocation(highAccuracy: Boolean, promise: Promise) {
    if (!hasFineLocation()) {
      promise.reject("E_PERMISSION", "Location permission not granted"); return
    }
    val priority = if (highAccuracy) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY

    // A fresh fix can be null (emulator / no active provider) or slow (indoors,
    // cold start). Cap the wait, and if it doesn't produce a location fall back
    // to the last known one so "Use my current location" still resolves.
    val settled = AtomicBoolean(false)
    val cts = CancellationTokenSource()
    val timeoutHandler = Handler(Looper.getMainLooper())
    val timeoutRunnable = Runnable { cts.cancel() } // → getCurrentLocation fails → fallback

    fun settleResolve(loc: Location) {
      if (settled.compareAndSet(false, true)) {
        timeoutHandler.removeCallbacksAndMessages(null)
        promise.resolve(serialize(loc))
      }
    }
    fun settleReject(code: String, message: String?, e: Exception?) {
      if (settled.compareAndSet(false, true)) {
        timeoutHandler.removeCallbacksAndMessages(null)
        promise.reject(code, message, e)
      }
    }

    fun fallbackToLastKnown() {
      try {
        fusedClient.lastLocation
          .addOnSuccessListener { last: Location? ->
            if (last != null) settleResolve(last)
            else settleReject("E_NO_LOCATION", "No location available", null)
          }
          .addOnFailureListener { e -> settleReject("E_LOCATION_FAIL", e.message, e) }
      } catch (e: SecurityException) {
        settleReject("E_PERMISSION", e.message, e)
      }
    }

    try {
      timeoutHandler.postDelayed(timeoutRunnable, 10_000)
      fusedClient.getCurrentLocation(priority, cts.token)
        .addOnSuccessListener { loc: Location? ->
          if (loc != null) settleResolve(loc) else fallbackToLastKnown()
        }
        .addOnFailureListener { _ -> fallbackToLastKnown() }
    } catch (e: SecurityException) {
      settleReject("E_PERMISSION", e.message, e)
    }
  }

  // ── Background collection (signal-driven) ───────────────────────────

  @ReactMethod
  fun startBackgroundLocation(options: ReadableMap, promise: Promise) {
    if (!hasFineLocation()) {
      promise.reject("E_PERMISSION", "Location permission not granted"); return
    }
    if (collecting) {
      promise.resolve(true); return
    }

    val intervalMs = if (options.hasKey("intervalMs")) options.getDouble("intervalMs").toLong() else 15L * 60 * 1000
    val distanceFilterM = if (options.hasKey("distanceFilterM")) options.getDouble("distanceFilterM").toFloat() else 50f
    val priority = when (options.getString("accuracy")) {
      "high" -> Priority.PRIORITY_HIGH_ACCURACY
      "low"  -> Priority.PRIORITY_LOW_POWER
      else   -> Priority.PRIORITY_BALANCED_POWER_ACCURACY
    }

    val request = LocationRequest.Builder(priority, intervalMs)
      .setMinUpdateDistanceMeters(distanceFilterM)
      // Batching ceiling — OS may deliver less often, never more.
      .setMaxUpdateDelayMillis(intervalMs * 2)
      .setWaitForAccurateLocation(false)
      .build()

    val callback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        for (loc in result.locations) emit("AddressIQLocationUpdate", serialize(loc))
      }
    }

    try {
      fusedClient.requestLocationUpdates(request, callback, Looper.getMainLooper())
      locationCallback = callback
      collecting = true

      // Promote to foreground service so the OS doesn't kill the
      // subscription when the host app backgrounds.
      val svcIntent = Intent(reactCtx, AddressIQLocationService::class.java).apply {
        putExtra(AddressIQLocationService.EXTRA_TITLE, options.getString("notificationTitle") ?: "Verifying your address")
        putExtra(AddressIQLocationService.EXTRA_BODY, options.getString("notificationBody") ?: "Location is being collected in the background")
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactCtx.startForegroundService(svcIntent)
      } else {
        reactCtx.startService(svcIntent)
      }

      promise.resolve(true)
    } catch (e: SecurityException) {
      promise.reject("E_PERMISSION", e.message, e)
    }
  }

  @ReactMethod
  fun stopBackgroundLocation(promise: Promise) {
    locationCallback?.let { fusedClient.removeLocationUpdates(it) }
    locationCallback = null
    collecting = false
    reactCtx.stopService(Intent(reactCtx, AddressIQLocationService::class.java))
    promise.resolve(null)
  }

  @ReactMethod
  fun isBackgroundRunning(promise: Promise) {
    promise.resolve(collecting)
  }

  // ── Adaptive geofences ──────────────────────────────────────────────

  @ReactMethod
  fun registerGeofence(options: ReadableMap, promise: Promise) {
    if (!hasFineLocation()) {
      promise.reject("E_PERMISSION", "Location permission not granted"); return
    }

    val identifier = options.getString("identifier")
      ?: run { promise.reject("E_ARGS", "identifier is required"); return }
    val lat = options.getDouble("lat")
    val lon = options.getDouble("lon")
    val radiusM = options.getDouble("radiusM").toFloat()
    val loiteringDelayMs = if (options.hasKey("loiteringDelayMs")) options.getInt("loiteringDelayMs") else 60_000

    val fence = Geofence.Builder()
      .setRequestId(identifier)
      .setCircularRegion(lat, lon, radiusM)
      .setExpirationDuration(Geofence.NEVER_EXPIRE)
      .setLoiteringDelay(loiteringDelayMs)
      .setTransitionTypes(
        Geofence.GEOFENCE_TRANSITION_ENTER or
          Geofence.GEOFENCE_TRANSITION_EXIT or
          Geofence.GEOFENCE_TRANSITION_DWELL,
      )
      .build()

    val request = GeofencingRequest.Builder()
      .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER or GeofencingRequest.INITIAL_TRIGGER_DWELL)
      .addGeofence(fence)
      .build()

    try {
      geofencingClient.addGeofences(request, geofencePendingIntent())
        .addOnSuccessListener { promise.resolve(true) }
        .addOnFailureListener { e -> promise.reject("E_GEOFENCE", e.message, e) }
    } catch (e: SecurityException) {
      promise.reject("E_PERMISSION", e.message, e)
    }
  }

  @ReactMethod
  fun unregisterGeofence(identifier: String, promise: Promise) {
    geofencingClient.removeGeofences(listOf(identifier))
      .addOnSuccessListener { promise.resolve(null) }
      .addOnFailureListener { e -> promise.reject("E_GEOFENCE", e.message, e) }
  }

  @ReactMethod
  fun unregisterAllGeofences(promise: Promise) {
    geofencingClient.removeGeofences(geofencePendingIntent())
      .addOnSuccessListener { promise.resolve(null) }
      .addOnFailureListener { e -> promise.reject("E_GEOFENCE", e.message, e) }
  }

  // ── Event subscription ──────────────────────────────────────────────

  @ReactMethod
  fun addListener(eventName: String) {
    // RCTDeviceEventEmitter API — implementation is in the JS bridge.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // RCTDeviceEventEmitter API — implementation is in the JS bridge.
  }

  // ── Internal helpers ────────────────────────────────────────────────

  internal fun emit(event: String, payload: WritableMap) {
    if (!reactCtx.hasActiveCatalystInstance()) return
    reactCtx
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, payload)
  }

  private fun hasFineLocation(): Boolean =
    ContextCompat.checkSelfPermission(reactCtx, Manifest.permission.ACCESS_FINE_LOCATION) ==
      PackageManager.PERMISSION_GRANTED

  private fun geofencePendingIntent(): PendingIntent {
    val intent = Intent(reactCtx, AddressIQGeofenceReceiver::class.java)
      .setAction(AddressIQGeofenceReceiver.ACTION_TRANSITION)
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    else
      PendingIntent.FLAG_UPDATE_CURRENT
    return PendingIntent.getBroadcast(reactCtx, GEOFENCE_REQUEST_CODE, intent, flags)
  }

  private fun serialize(loc: Location): WritableMap {
    val m = Arguments.createMap()
    m.putDouble("lat", loc.latitude)
    m.putDouble("lon", loc.longitude)
    m.putDouble("accuracyM", loc.accuracy.toDouble())
    if (loc.hasAltitude()) m.putDouble("altitudeM", loc.altitude) else m.putNull("altitudeM")
    if (loc.hasSpeed()) m.putDouble("speedMps", loc.speed.toDouble()) else m.putNull("speedMps")
    if (loc.hasBearing()) m.putDouble("headingDeg", loc.bearing.toDouble()) else m.putNull("headingDeg")
    m.putDouble("timestampMs", loc.time.toDouble())
    m.putBoolean(
      "isMock",
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) loc.isMock else loc.isFromMockProvider,
    )
    m.putString("provider", loc.provider)
    m.putString("eventType", "BACKGROUND_CHECK")
    return m
  }

  companion object {
    private const val GEOFENCE_REQUEST_CODE = 0x4149_4751

    /**
     * Live reference so the geofence receiver can emit through the
     * module without re-instantiating it. Set in `init`, cleared in
     * `invalidate()`. Null when the JS bridge is dead.
     */
    @Volatile internal var instance: AddressIQLocationModule? = null
  }
}
