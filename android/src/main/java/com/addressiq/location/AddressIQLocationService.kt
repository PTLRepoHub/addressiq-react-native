package com.addressiq.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the host process alive while
 * `AddressIQLocationModule` has an active FusedLocationProvider
 * subscription. Started exclusively from
 * `AddressIQLocationModule.startBackgroundLocation()` and stopped
 * from the matching `stopBackgroundLocation()` call.
 *
 * The service holds no work of its own — the location callback is
 * registered against the module's `FusedLocationProviderClient`. The
 * foreground promotion exists only to satisfy Android's background
 * location restrictions (Android 8+) and the foreground-service-type
 * mandate (Android 14+).
 */
class AddressIQLocationService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Verifying your address"
    val body = intent?.getStringExtra(EXTRA_BODY) ?: "Location is being collected in the background"

    ensureChannel()

    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    return START_STICKY
  }

  override fun onDestroy() {
    super.onDestroy()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION") stopForeground(true)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Address verification",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Background location collection during address verification."
      setShowBadge(false)
    }
    mgr.createNotificationChannel(channel)
  }

  companion object {
    const val EXTRA_TITLE = "addressiq.title"
    const val EXTRA_BODY = "addressiq.body"
    private const val CHANNEL_ID = "addressiq.location"
    private const val NOTIFICATION_ID = 0x4149_4951
  }
}
