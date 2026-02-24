package main

import _ "embed"

// iconData is the ClawMiner claw icon (64x64 PNG) embedded at compile time.
// Source: assets/tray-icon.png (derived from iOS AppIcon.png)
//
//go:embed tray-icon.png
var iconData []byte
