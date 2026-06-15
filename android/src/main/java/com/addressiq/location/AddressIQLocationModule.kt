package com.addressiq.location

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
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

  // ── Foreground reading ──────────────────────────────────────────────

  @ReactMethod
  fun getCurrentLocation(highAccuracy: Boolean, promise: Promise) {
    if (!hasFineLocation()) {
      promise.reject("E_PERMISSION", "Location permission not granted"); return
    }
    val priority = if (highAccuracy) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY
    try {
      fusedClient.getCurrentLocation(priority, null)
        .addOnSuccessListener { loc: Location? ->
          if (loc == null) promise.reject("E_NO_LOCATION", "No location available")
          else promise.resolve(serialize(loc))
        }
        .addOnFailureListener { e -> promise.reject("E_LOCATION_FAIL", e.message, e) }
    } catch (e: SecurityException) {
      promise.reject("E_PERMISSION", e.message, e)
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
