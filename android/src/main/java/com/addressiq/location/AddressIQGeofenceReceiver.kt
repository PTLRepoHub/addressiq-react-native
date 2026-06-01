package com.addressiq.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent

/**
 * Receives geofence transition broadcasts from Play Services. Each
 * transition is forwarded to the JS bridge as an
 * `AddressIQGeofenceTransition` event when the React context is alive.
 *
 * When the host app has been killed and JS isn't running, this receiver
 * still fires (manifest-registered) but the emit becomes a no-op. The
 * follow-up slice adds a SharedPreferences-backed transition queue that
 * the JS bridge drains on next launch.
 */
class AddressIQGeofenceReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_TRANSITION) return

    val event = GeofencingEvent.fromIntent(intent)
    if (event == null || event.hasError()) {
      Log.w(TAG, "Geofencing event error: ${event?.errorCode}")
      return
    }

    val transitionName = when (event.geofenceTransition) {
      Geofence.GEOFENCE_TRANSITION_ENTER -> "ENTER"
      Geofence.GEOFENCE_TRANSITION_EXIT  -> "EXIT"
      Geofence.GEOFENCE_TRANSITION_DWELL -> "DWELL"
      else -> return
    }

    val triggering = event.triggeringGeofences ?: emptyList()
    val module = AddressIQLocationModule.instance ?: return

    for (fence in triggering) {
      val payload = Arguments.createMap()
      payload.putString("identifier", fence.requestId)
      payload.putString("transition", transitionName)
      event.triggeringLocation?.let {
        payload.putDouble("lat", it.latitude)
        payload.putDouble("lon", it.longitude)
        payload.putDouble("accuracyM", it.accuracy.toDouble())
        payload.putDouble("timestampMs", it.time.toDouble())
      }
      module.emit("AddressIQGeofenceTransition", payload)
    }
  }

  companion object {
    const val ACTION_TRANSITION = "com.addressiq.location.GEOFENCE_TRANSITION"
    private const val TAG = "AddressIQGeofence"
  }
}
