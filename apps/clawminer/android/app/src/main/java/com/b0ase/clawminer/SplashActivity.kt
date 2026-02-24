package com.b0ase.clawminer

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Paint
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.animation.AnimationUtils
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import mobile.Mobile

class SplashActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private val maxWaitMs = 3000L
    private val pollIntervalMs = 200L
    private var elapsedMs = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Full-screen immersive mode
        @Suppress("DEPRECATION")
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        setContentView(R.layout.activity_splash)
        forceTextFill(window.decorView)

        // Request notification permission on Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                ActivityCompat.requestPermissions(
                    this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1
                )
            }
        }

        // Start the foreground service (boots the Go daemon)
        val serviceIntent = Intent(this, ClawMinerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }

        // Start animations
        startAnimations()

        // Poll for daemon readiness
        handler.postDelayed(daemonPoller, pollIntervalMs)
    }

    private fun startAnimations() {
        val icon = findViewById<ImageView>(R.id.splash_icon)
        val title = findViewById<TextView>(R.id.splash_title)
        val subtitle = findViewById<TextView>(R.id.splash_subtitle)
        val progress = findViewById<ProgressBar>(R.id.splash_progress)

        // Pulse animation on the claw
        val pulseAnim = AnimationUtils.loadAnimation(this, R.anim.pulse)
        icon.startAnimation(pulseAnim)

        // Fade in title after a short delay
        val fadeIn = AnimationUtils.loadAnimation(this, R.anim.fade_in)
        handler.postDelayed({
            title.alpha = 1f
            title.startAnimation(fadeIn)
        }, 300)

        // Fade in subtitle
        handler.postDelayed({
            subtitle.alpha = 1f
            subtitle.startAnimation(AnimationUtils.loadAnimation(this, R.anim.fade_in))
        }, 600)

        // Fade in progress spinner
        handler.postDelayed({
            progress.alpha = 1f
            progress.startAnimation(AnimationUtils.loadAnimation(this, R.anim.fade_in))
        }, 900)
    }

    private val daemonPoller = object : Runnable {
        override fun run() {
            elapsedMs += pollIntervalMs
            if (Mobile.isRunning() || elapsedMs >= maxWaitMs) {
                navigateToDashboard()
            } else {
                handler.postDelayed(this, pollIntervalMs)
            }
        }
    }

    private fun navigateToDashboard() {
        handler.removeCallbacks(daemonPoller)
        val intent = Intent(this, MainActivity::class.java)
        startActivity(intent)
        @Suppress("DEPRECATION")
        overridePendingTransition(R.anim.fade_in, R.anim.fade_out)
        finish()
    }

    private fun forceTextFill(v: View) {
        if (v is TextView) {
            v.paint.style = Paint.Style.FILL
            v.paint.strokeWidth = 0f
        }
        if (v is ViewGroup) {
            for (i in 0 until v.childCount) forceTextFill(v.getChildAt(i))
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(daemonPoller)
    }
}
