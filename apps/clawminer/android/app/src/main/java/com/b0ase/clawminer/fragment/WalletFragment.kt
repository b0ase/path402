package com.b0ase.clawminer.fragment

import android.Manifest
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Paint
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import android.widget.Button
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.b0ase.clawminer.DaemonStatusListener
import com.b0ase.clawminer.R
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
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

    // ── Export ────────────────────────────────────────────────

    private fun onExportClicked() {
        AlertDialog.Builder(requireContext())
            .setTitle("Export Private Key")
            .setMessage("This is your private key. Never share it with anyone.")
            .setPositiveButton("Show QR") { _, _ -> exportWIF() }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun exportWIF() {
        setButtonsEnabled(false)
        CoroutineScope(Dispatchers.IO).launch {
            val json = Mobile.exportWIF()
            val result = JSONObject(json)
            withContext(Dispatchers.Main) {
                if (!isAdded) return@withContext
                setButtonsEnabled(true)

                val error = result.optString("error", "")
                if (error.isNotEmpty()) {
                    Toast.makeText(requireContext(), error, Toast.LENGTH_SHORT).show()
                    return@withContext
                }

                val wif = result.optString("wif", "")
                if (wif.isEmpty()) {
                    Toast.makeText(requireContext(), "No WIF available", Toast.LENGTH_SHORT).show()
                    return@withContext
                }

                showQrDialog(wif)
            }
        }
    }

    private fun showQrDialog(wif: String) {
        val dialogView = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_qr_display, null)

        val qrImage = dialogView.findViewById<ImageView>(R.id.qr_image)
        val wifText = dialogView.findViewById<TextView>(R.id.qr_wif_text)
        val closeBtn = dialogView.findViewById<Button>(R.id.qr_close_button)

        // Generate QR bitmap
        val bitmap = generateQrBitmap(wif, 512)
        qrImage.setImageBitmap(bitmap)
        wifText.text = wif

        val dialog = AlertDialog.Builder(requireContext(), R.style.Theme_ClawMiner_Dialog)
            .setView(dialogView)
            .setCancelable(true)
            .create()

        closeBtn.setOnClickListener { dialog.dismiss() }
        dialog.show()
    }

    private fun generateQrBitmap(content: String, size: Int): Bitmap {
        val writer = QRCodeWriter()
        val bitMatrix = writer.encode(content, BarcodeFormat.QR_CODE, size, size)
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
        for (x in 0 until size) {
            for (y in 0 until size) {
                bitmap.setPixel(x, y, if (bitMatrix[x, y]) Color.BLACK else Color.WHITE)
            }
        }
        return bitmap
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
            if (walletStatusText.text.isEmpty()) {
                walletStatusText.text = if (address.isNotEmpty()) "Auto-generated keypair" else ""
            }
        } else {
            walletAddressText.text = "\u2014"
            walletPubkeyText.text = "\u2014"
            walletStatusText.text = ""
        }
    }

    override fun onDaemonNotRunning() {
        if (!isAdded) return
        walletAddressText.text = "\u2014"
        walletPubkeyText.text = "\u2014"
        walletStatusText.text = ""
    }
}
