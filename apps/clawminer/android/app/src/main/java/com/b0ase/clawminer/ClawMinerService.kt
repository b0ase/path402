package com.b0ase.clawminer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import mobile.Mobile

class ClawMinerService : Service() {

    companion object {
        const val TAG = "ClawMinerService"
        const val CHANNEL_ID = "clawminer_channel"
        const val NOTIFICATION_ID = 1
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var multicastLock: WifiManager.MulticastLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification("Starting..."))

        // Acquire partial wake lock to keep CPU running
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ClawMiner::Mining").apply {
            acquire()
        }

        // Acquire multicast lock so mDNS peer discovery works over WiFi
        val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        multicastLock = wm.createMulticastLock("ClawMiner::mDNS").apply {
            setReferenceCounted(true)
            acquire()
        }
        Log.i(TAG, "MulticastLock acquired for mDNS peer discovery")

        // Start the Go daemon
        Thread {
            try {
                val dataDir = filesDir.absolutePath + "/clawminer"
                java.io.File(dataDir).mkdirs()
                Mobile.start("", dataDir)
                Log.i(TAG, "Daemon started in $dataDir")
                updateNotification("Mining active")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start daemon: ${e.message}")
                updateNotification("Error: ${e.message}")
            }
        }.start()

        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            Mobile.stop()
            Log.i(TAG, "Daemon stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping daemon: ${e.message}")
        }
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        multicastLock?.let {
            if (it.isHeld) it.release()
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "ClawMiner Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "ClawMiner mining and header sync service"
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }.apply {
            setContentTitle("ClawMiner")
            setContentText(text)
            setSmallIcon(R.drawable.ic_notification)
            setContentIntent(pendingIntent)
            setOngoing(true)
        }.build()
    }

    private fun updateNotification(text: String) {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID, buildNotification(text))
    }
}
