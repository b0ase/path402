package com.b0ase.clawminer.fragment

import android.Manifest
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.graphics.Paint
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Button
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.b0ase.clawminer.DaemonStatusListener
import com.b0ase.clawminer.R
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mobile.Mobile
import org.json.JSONObject

class WalletFragment : Fragment(), DaemonStatusListener {

    private lateinit var walletAddressText: TextView
    private lateinit var walletPubkeyText: TextView
    private lateinit var walletBalanceText: TextView
    private lateinit var walletStatusText: TextView
    private lateinit var btnGenerate: Button
    private lateinit var btnImport: Button
    private lateinit var btnExport: Button

    // QR scanner launcher
    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            importWallet(result.contents)
        }
    }

    // Camera permission launcher
    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            launchScanner()
        } else {
            Toast.makeText(requireContext(), "Camera permission required for QR scan", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_wallet, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        forceTextFill(view)
        walletAddressText = view.findViewById(R.id.wallet_address_text)
        walletPubkeyText = view.findViewById(R.id.wallet_pubkey_text)
        walletBalanceText = view.findViewById(R.id.wallet_balance_text)
        walletStatusText = view.findViewById(R.id.wallet_status_text)
        btnGenerate = view.findViewById(R.id.btn_generate_wallet)
        btnImport = view.findViewById(R.id.btn_import_qr)
        btnExport = view.findViewById(R.id.btn_export_wif)

        btnGenerate.setOnClickListener { onGenerateClicked() }
        btnImport.setOnClickListener { onImportClicked() }
        btnExport.setOnClickListener { onExportClicked() }
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

    // ── Generate ─────────────────────────────────────────────

    private fun onGenerateClicked() {
        AlertDialog.Builder(requireContext())
            .setTitle("Generate New Wallet")
            .setMessage("This will replace your current wallet. Back up your WIF first.")
            .setPositiveButton("Generate") { _, _ -> generateWallet() }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun generateWallet() {
        setButtonsEnabled(false)
        CoroutineScope(Dispatchers.IO).launch {
            val json = Mobile.generateWallet()
            withContext(Dispatchers.Main) {
                if (!isAdded) return@withContext
                setButtonsEnabled(true)
                handleWalletResult(json, "Generated")
            }
        }
    }

    // ── Import ───────────────────────────────────────────────

    private fun onImportClicked() {
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            launchScanner()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun launchScanner() {
        val options = ScanOptions().apply {
            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
            setPrompt("Scan WIF QR code")
            setBeepEnabled(false)
            setOrientationLocked(true)
        }
        scanLauncher.launch(options)
    }

    private fun importWallet(wif: String) {
        setButtonsEnabled(false)
        CoroutineScope(Dispatchers.IO).launch {
            val json = Mobile.importWallet(wif)
            withContext(Dispatchers.Main) {
                if (!isAdded) return@withContext
                setButtonsEnabled(true)
                handleWalletResult(json, "Imported")
            }
        }
    }

    // ── Export (disabled — key export removed for security) ───

    private fun onExportClicked() {
        Toast.makeText(requireContext(), "Key export disabled for security", Toast.LENGTH_SHORT).show()
    }

    // ── Helpers ───────────────────────────────────────────────

    private fun handleWalletResult(json: String, verb: String) {
        val result = JSONObject(json)
        val error = result.optString("error", "")
        if (error.isNotEmpty()) {
            Toast.makeText(requireContext(), error, Toast.LENGTH_SHORT).show()
            return
        }
        val address = result.optString("address", "")
        val pubKey = result.optString("public_key", "")
        walletAddressText.text = address.ifEmpty { "\u2014" }
        walletPubkeyText.text = pubKey.ifEmpty { "\u2014" }
        walletStatusText.text = "$verb wallet"
        Toast.makeText(requireContext(), "Wallet $verb", Toast.LENGTH_SHORT).show()
    }

    private fun setButtonsEnabled(enabled: Boolean) {
        btnGenerate.isEnabled = enabled
        btnImport.isEnabled = enabled
        btnExport.isEnabled = enabled
    }

    // ── Status poll callbacks ─────────────────────────────────

    override fun onStatusUpdate(status: JSONObject) {
        if (!isAdded) return
        val wallet = status.optJSONObject("wallet")
        if (wallet != null) {
            val address = wallet.optString("address", "")
            val pubKey = wallet.optString("public_key", "")

            walletAddressText.text = address.ifEmpty { "\u2014" }
            walletPubkeyText.text = pubKey.ifEmpty { "\u2014" }

            // Balance display
            if (wallet.has("balance_satoshis")) {
                val sats = wallet.optLong("balance_satoshis", 0)
                val bsv = sats.toDouble() / 100_000_000.0
                walletBalanceText.text = "%.8f BSV".format(bsv)
                if (wallet.optBoolean("low_balance", false)) {
                    walletBalanceText.setTextColor(android.graphics.Color.parseColor("#FF3333"))
                } else {
                    walletBalanceText.setTextColor(android.graphics.Color.parseColor("#00CC66"))
                }
            }

            if (walletStatusText.text.isEmpty()) {
                walletStatusText.text = if (address.isNotEmpty()) "Auto-generated keypair" else ""
            }
        } else {
            walletAddressText.text = "\u2014"
            walletPubkeyText.text = "\u2014"
            walletBalanceText.text = "\u2014"
            walletStatusText.text = ""
        }
    }

    override fun onDaemonNotRunning() {
        if (!isAdded) return
        walletAddressText.text = "\u2014"
        walletPubkeyText.text = "\u2014"
        walletBalanceText.text = "\u2014"
        walletStatusText.text = ""
    }
}
