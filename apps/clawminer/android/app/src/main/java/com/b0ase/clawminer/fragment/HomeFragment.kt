package com.b0ase.clawminer.fragment

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Paint
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.b0ase.clawminer.DaemonStatusListener
import com.b0ase.clawminer.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class HomeFragment : Fragment(), DaemonStatusListener {

    private lateinit var versionText: TextView
    private lateinit var nodeIdText: TextView
    private lateinit var uptimeText: TextView
    private lateinit var peersText: TextView
    private lateinit var statusDot: View
    private lateinit var hashRateText: TextView
    private lateinit var tokensText: TextView
    private lateinit var blocksText: TextView
    private lateinit var btnVoiceInput: ImageButton

    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false

    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                startListening()
            } else {
                Toast.makeText(requireContext(), "Microphone permission denied", Toast.LENGTH_SHORT).show()
            }
        }

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
        tokensText = view.findViewById(R.id.tokens_text)
        blocksText = view.findViewById(R.id.blocks_text)
        btnVoiceInput = view.findViewById(R.id.btn_voice_input)

        try {
            versionText.text = "v${mobile.Mobile.getVersion()}"
        } catch (_: Exception) {
            versionText.text = "v0.1.0"
        }

        btnVoiceInput.setOnClickListener { onMicTap() }
    }

    private fun onMicTap() {
        if (!SpeechRecognizer.isRecognitionAvailable(requireContext())) {
            Toast.makeText(requireContext(), "Speech recognition not available", Toast.LENGTH_SHORT).show()
            return
        }

        if (isListening) {
            stopListening()
            return
        }

        // Check permission
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        } else {
            startListening()
        }
    }

    private fun startListening() {
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(requireContext()).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    isListening = true
                    activity?.runOnUiThread {
                        btnVoiceInput.alpha = 0.5f
                        Toast.makeText(requireContext(), "Listening...", Toast.LENGTH_SHORT).show()
                    }
                }

                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {
                    isListening = false
                    activity?.runOnUiThread { btnVoiceInput.alpha = 1.0f }
                }

                override fun onError(error: Int) {
                    isListening = false
                    activity?.runOnUiThread {
                        btnVoiceInput.alpha = 1.0f
                        val msg = when (error) {
                            SpeechRecognizer.ERROR_NO_MATCH -> "No speech detected"
                            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Speech timeout"
                            SpeechRecognizer.ERROR_AUDIO -> "Audio error"
                            SpeechRecognizer.ERROR_NETWORK -> "Network error"
                            else -> "Recognition error ($error)"
                        }
                        Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
                    }
                }

                override fun onResults(results: Bundle?) {
                    isListening = false
                    activity?.runOnUiThread { btnVoiceInput.alpha = 1.0f }
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val transcript = matches?.firstOrNull() ?: return
                    activity?.runOnUiThread {
                        Toast.makeText(requireContext(), transcript, Toast.LENGTH_LONG).show()
                    }
                    sendToOpenClaw(transcript)
                }

                override fun onPartialResults(partialResults: Bundle?) {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
        }

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        }
        speechRecognizer?.startListening(intent)
    }

    private fun stopListening() {
        isListening = false
        speechRecognizer?.stopListening()
        btnVoiceInput.alpha = 1.0f
    }

    private fun sendToOpenClaw(text: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = URL("http://127.0.0.1:18789/api/v1/message")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 5000
                conn.readTimeout = 5000

                val body = JSONObject().apply {
                    put("message", text)
                    put("source", "voice")
                }

                OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }

                val code = conn.responseCode
                if (code != 200) {
                    activity?.runOnUiThread {
                        Toast.makeText(requireContext(), "OpenClaw: HTTP $code", Toast.LENGTH_SHORT).show()
                    }
                }
                conn.disconnect()
            } catch (e: Exception) {
                activity?.runOnUiThread {
                    Toast.makeText(requireContext(), "OpenClaw offline", Toast.LENGTH_SHORT).show()
                }
            }
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

        // Tokens discovered
        val tokens = status.optJSONObject("tokens")
        val tokenCount = tokens?.optInt("known", 0) ?: 0
        tokensText.text = tokenCount.toString()

        // Blocks mined
        val blocksMined = mining.optInt("blocks_mined", 0)
        blocksText.text = blocksMined.toString()
    }

    override fun onDaemonNotRunning() {
        if (!isAdded) return
        nodeIdText.text = getString(R.string.label_starting)
        uptimeText.text = "\u2014"
        peersText.text = "\u2014"
        hashRateText.text = "\u2014 H/s"
        tokensText.text = "\u2014"
        blocksText.text = "\u2014"
    }

    override fun onDestroyView() {
        super.onDestroyView()
        speechRecognizer?.destroy()
        speechRecognizer = null
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
