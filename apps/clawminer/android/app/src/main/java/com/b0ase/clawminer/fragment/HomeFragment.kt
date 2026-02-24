package com.b0ase.clawminer.fragment

import android.graphics.Paint
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.b0ase.clawminer.DaemonStatusListener
import com.b0ase.clawminer.R
import org.json.JSONObject

class HomeFragment : Fragment(), DaemonStatusListener {

    private lateinit var versionText: TextView
    private lateinit var nodeIdText: TextView
    private lateinit var uptimeText: TextView
    private lateinit var peersText: TextView
    private lateinit var statusDot: View
    private lateinit var hashRateText: TextView

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_home, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        forceTextFill(view)
        versionText = view.findViewById(R.id.version_text)
        nodeIdText = view.findViewById(R.id.node_id_text)
        uptimeText = view.findViewById(R.id.uptime_text)
        peersText = view.findViewById(R.id.peers_text)
        statusDot = view.findViewById(R.id.status_dot)
        hashRateText = view.findViewById(R.id.hash_rate_text)

        try {
            versionText.text = "v${mobile.Mobile.getVersion()}"
        } catch (_: Exception) {
            versionText.text = "v0.1.0"
        }
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

    override fun onStatusUpdate(status: JSONObject) {
        if (!isAdded) return
        val mining = status.optJSONObject("mining") ?: JSONObject()

        // Node ID (truncated)
        val nodeId = status.optString("node_id", "")
        nodeIdText.text = if (nodeId.length > 16) "${nodeId.take(8)}...${nodeId.takeLast(4)}" else nodeId

        // Uptime
        val uptimeMs = status.optLong("uptime_ms", 0)
        uptimeText.text = formatUptime(uptimeMs)

        // Peers
        val peers = status.optInt("peers", 0)
        peersText.text = peers.toString()
        statusDot.setBackgroundResource(
            if (peers > 0) R.drawable.status_dot_green else R.drawable.status_dot_orange
        )

        // Hash rate
        val hashRate = mining.optDouble("hash_rate", 0.0).toInt()
        hashRateText.text = "$hashRate H/s"
    }

    override fun onDaemonNotRunning() {
        if (!isAdded) return
        nodeIdText.text = getString(R.string.label_starting)
        uptimeText.text = "\u2014"
        peersText.text = "\u2014"
        hashRateText.text = "\u2014 H/s"
    }

    private fun formatUptime(ms: Long): String {
        val s = ms / 1000
        val m = s / 60
        val h = m / 60
        val d = h / 24
        return when {
            d > 0 -> "${d}d ${h % 24}h"
            h > 0 -> "${h}h ${m % 60}m"
            m > 0 -> "${m}m ${s % 60}s"
            else -> "${s}s"
        }
    }
}
