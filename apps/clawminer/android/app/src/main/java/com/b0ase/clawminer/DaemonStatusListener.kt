package com.b0ase.clawminer

import org.json.JSONObject

interface DaemonStatusListener {
    fun onStatusUpdate(status: JSONObject)
    fun onDaemonNotRunning()
}
