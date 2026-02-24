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

class SettingsFragment : Fragment(), DaemonStatusListener {

    private lateinit var versionText: TextView
    private lateinit var nodeIdText: TextView

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_settings, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        forceTextFill(view)
        versionText = view.findViewById(R.id.settings_version_text)
        nodeIdText = view.findViewById(R.id.settings_node_id_text)

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
        val nodeId = status.optString("node_id", "")
        nodeIdText.text = nodeId.ifEmpty { "\u2014" }
    }

    override fun onDaemonNotRunning() {
        if (!isAdded) return
        nodeIdText.text = getString(R.string.label_starting)
    }
}
