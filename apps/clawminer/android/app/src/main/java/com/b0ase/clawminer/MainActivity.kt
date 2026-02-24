package com.b0ase.clawminer

import android.graphics.Paint
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.b0ase.clawminer.fragment.HomeFragment
import com.b0ase.clawminer.fragment.MiningFragment
import com.b0ase.clawminer.fragment.SettingsFragment
import com.b0ase.clawminer.fragment.WalletFragment
import com.google.android.material.bottomnavigation.BottomNavigationView
import mobile.Mobile
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var bottomNav: BottomNavigationView

    private val homeFragment = HomeFragment()
    private val miningFragment = MiningFragment()
    private val walletFragment = WalletFragment()
    private val settingsFragment = SettingsFragment()

    private var activeFragment: Fragment = homeFragment

    private val allFragments: List<Fragment>
        get() = listOf(homeFragment, miningFragment, walletFragment, settingsFragment)

    private val handler = Handler(Looper.getMainLooper())
    private val pollInterval = 2000L

    private val statusPoller = object : Runnable {
        override fun run() {
            pollDaemonStatus()
            handler.postDelayed(this, pollInterval)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        bottomNav = findViewById(R.id.bottom_nav)
        forceTextFill(window.decorView)

        if (savedInstanceState == null) {
            setupFragments()
        } else {
            restoreFragments()
        }

        bottomNav.setOnItemSelectedListener { item ->
            val target = when (item.itemId) {
                R.id.nav_home -> homeFragment
                R.id.nav_mining -> miningFragment
                R.id.nav_wallet -> walletFragment
                R.id.nav_settings -> settingsFragment
                else -> homeFragment
            }
            if (target !== activeFragment) {
                supportFragmentManager.beginTransaction()
                    .hide(activeFragment)
                    .show(target)
                    .commit()
                activeFragment = target
            }
            true
        }
    }

    private fun setupFragments() {
        supportFragmentManager.beginTransaction()
            .add(R.id.fragment_container, settingsFragment, "settings").hide(settingsFragment)
            .add(R.id.fragment_container, walletFragment, "wallet").hide(walletFragment)
            .add(R.id.fragment_container, miningFragment, "mining").hide(miningFragment)
            .add(R.id.fragment_container, homeFragment, "home")
            .commit()
        activeFragment = homeFragment
    }

    private fun restoreFragments() {
        val fm = supportFragmentManager
        val home = fm.findFragmentByTag("home") as? HomeFragment
        val mining = fm.findFragmentByTag("mining") as? MiningFragment
        val wallet = fm.findFragmentByTag("wallet") as? WalletFragment
        val settings = fm.findFragmentByTag("settings") as? SettingsFragment

        if (home != null && mining != null && wallet != null && settings != null) {
            // Fragments survived config change — find which one is visible
            activeFragment = listOf(home, mining, wallet, settings).firstOrNull { !it.isHidden } ?: home
        } else {
            setupFragments()
        }
    }

    override fun onResume() {
        super.onResume()
        handler.post(statusPoller)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(statusPoller)
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

    private fun pollDaemonStatus() {
        if (!Mobile.isRunning()) {
            allFragments.forEach { fragment ->
                (fragment as? DaemonStatusListener)?.onDaemonNotRunning()
            }
            return
        }

        try {
            val status = JSONObject(Mobile.getStatus())
            allFragments.forEach { fragment ->
                (fragment as? DaemonStatusListener)?.onStatusUpdate(status)
            }
        } catch (_: Exception) { }
    }
}
