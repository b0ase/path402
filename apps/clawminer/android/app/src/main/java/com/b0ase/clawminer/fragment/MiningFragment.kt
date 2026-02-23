package com.b0ase.clawminer.fragment

import android.graphics.Color
import android.graphics.Paint
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.b0ase.clawminer.DaemonStatusListener
import com.b0ase.clawminer.R
import mobile.Mobile
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

class MiningFragment : Fragment(), DaemonStatusListener {

    private lateinit var miningProgress: ProgressBar
    private lateinit var blocksMinedText: TextView
    private lateinit var mempoolText: TextView
    private lateinit var syncProgress: ProgressBar
    private lateinit var syncPercentText: TextView
    private lateinit var syncHeightText: TextView
    private lateinit var syncStatusLabel: TextView
    private lateinit var blocksList: LinearLayout

    private val numberFormat = NumberFormat.getNumberInstance(Locale.US)

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_mining, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        forceTextFill(view)
        miningProgress = view.findViewById(R.id.mining_progress)
        blocksMinedText = view.findViewById(R.id.blocks_mined_text)
        mempoolText = view.findViewById(R.id.mempool_text)
        syncProgress = view.findViewById(R.id.sync_progress)
        syncPercentText = view.findViewById(R.id.sync_percent_text)
        syncHeightText = view.findViewById(R.id.sync_height_text)
        syncStatusLabel = view.findViewById(R.id.sync_status_label)
        blocksList = view.findViewById(R.id.blocks_list)
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
        val headers = status.optJSONObject("headers") ?: JSONObject()
        updateMining(mining)
        updateHeaderSync(headers)
        updateRecentBlocks()
    }

    override fun onDaemonNotRunning() {
        if (!isAdded) return
        blocksMinedText.text = "0"
        mempoolText.text = "0"
        miningProgress.progress = 0
        syncPercentText.text = "\u2014"
        syncHeightText.text = ""
        syncProgress.progress = 0
    }

    private fun updateMining(mining: JSONObject) {
        val hashRate = mining.optDouble("hash_rate", 0.0).toInt()
        val blocksMined = mining.optInt("blocks_mined", 0)
        val mempoolSize = mining.optInt("mempool_size", 0)

        blocksMinedText.text = numberFormat.format(blocksMined)
        mempoolText.text = numberFormat.format(mempoolSize)
        miningProgress.progress = hashRate.coerceAtMost(100)
    }

    private fun updateHeaderSync(headers: JSONObject) {
        if (!headers.optBoolean("enabled", false)) {
            syncStatusLabel.text = getString(R.string.label_disabled)
            syncPercentText.text = "\u2014"
            syncHeightText.text = ""
            syncProgress.progress = 0
            return
        }

        val isSyncing = headers.optBoolean("is_syncing", false)
        val highestHeight = headers.optInt("highest_height", 0)
        val chainTip = headers.optInt("chain_tip", 1)

        val percent = if (chainTip > 0) {
            (highestHeight.toFloat() / chainTip.toFloat() * 100f).coerceIn(0f, 100f)
        } else 0f

        syncStatusLabel.text = if (isSyncing) getString(R.string.label_syncing)
                               else getString(R.string.label_synced)

        syncPercentText.text = "%.1f%%".format(percent)
        syncHeightText.text = "${numberFormat.format(highestHeight)} / ${numberFormat.format(chainTip)}"
        syncProgress.progress = (percent * 10).toInt()
    }

    private fun updateRecentBlocks() {
        try {
            val json = Mobile.getBlocks(5)
            val blocks = JSONArray(json)
            blocksList.removeAllViews()

            if (blocks.length() == 0) {
                val empty = TextView(requireContext()).apply {
                    text = "No blocks yet"
                    setTextColor(Color.parseColor("#57534e"))
                    textSize = 12f
                }
                blocksList.addView(empty)
                return
            }

            for (i in 0 until blocks.length()) {
                val b = blocks.getJSONObject(i)
                val height = b.optInt("height", 0)
                val hash = b.optString("hash", "").take(12)
                val isOwn = b.optBoolean("is_own", false)
                val label = if (isOwn) "own" else "peer"

                val row = TextView(requireContext()).apply {
                    text = "#$height  ${hash}...  $label"
                    typeface = android.graphics.Typeface.MONOSPACE
                    textSize = 12f
                    setTextColor(if (isOwn) Color.parseColor("#f97316") else Color.parseColor("#a8a29e"))
                    setPadding(0, 4, 0, 4)
                }
                blocksList.addView(row)
            }
        } catch (_: Exception) {
            // Silently ignore if blocks aren't available yet
        }
    }
}
