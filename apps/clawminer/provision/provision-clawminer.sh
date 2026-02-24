#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  ClawMiner Provisioning Script
#  Turns a stock DOOGEE Fire 3 Ultra into a ClawMiner unit
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APK_PATH="${SCRIPT_DIR}/clawminer.apk"
WALLPAPER_DIR="${SCRIPT_DIR}/wallpapers"
DEFAULT_WALLPAPER="clawminer-pcb-claw-clean.jpg"
BLOATWARE_LIST="${SCRIPT_DIR}/bloatware.txt"
MANIFEST="${SCRIPT_DIR}/manifest.csv"

# Colors
ORANGE='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# Find ADB
if command -v adb &>/dev/null; then
    ADB="adb"
elif [ -f "$HOME/Library/Android/sdk/platform-tools/adb" ]; then
    ADB="$HOME/Library/Android/sdk/platform-tools/adb"
else
    echo -e "${RED}ERROR: adb not found. Install Android SDK platform-tools.${NC}"
    exit 1
fi

# ───────────────────────────────────────────────────────────────
banner() {
    echo ""
    echo -e "${ORANGE}${BOLD}"
    echo "   ╔═══════════════════════════════════════╗"
    echo "   ║     🦀 ClawMiner Provisioning Tool    ║"
    echo "   ║     \$402 Proof-of-Indexing Miner      ║"
    echo "   ╚═══════════════════════════════════════╝"
    echo -e "${NC}"
}

step() {
    echo -e "\n${ORANGE}[$1/9]${NC} ${BOLD}$2${NC}"
}

ok() {
    echo -e "  ${GREEN}✓${NC} $1"
}

warn() {
    echo -e "  ${ORANGE}⚠${NC} $1"
}

fail() {
    echo -e "  ${RED}✗${NC} $1"
}

info() {
    echo -e "  ${DIM}$1${NC}"
}

# ───────────────────────────────────────────────────────────────
banner

# ═══════════════════════════════════════════════════════════════
# STEP 1: Verify device connection
# ═══════════════════════════════════════════════════════════════
step 1 "Checking device connection"

DEVICE_COUNT=$($ADB devices | grep -c "device$" || true)
if [ "$DEVICE_COUNT" -eq 0 ]; then
    fail "No device connected. Plug in the DOOGEE and enable USB Debugging."
    exit 1
elif [ "$DEVICE_COUNT" -gt 1 ]; then
    fail "Multiple devices connected. Plug in only one DOOGEE at a time."
    echo ""
    $ADB devices
    exit 1
fi

SERIAL=$($ADB get-serialno)
MODEL=$($ADB shell getprop ro.product.model | tr -d '\r')
BRAND=$($ADB shell getprop ro.product.brand | tr -d '\r')
ANDROID_VER=$($ADB shell getprop ro.build.version.release | tr -d '\r')
FIRMWARE=$($ADB shell getprop ro.build.display.id | tr -d '\r')
SERIAL_SHORT="${SERIAL: -4}"

ok "Connected: ${BRAND} ${MODEL}"
info "Serial: ${SERIAL}"
info "Android: ${ANDROID_VER} | Firmware: ${FIRMWARE}"

if [[ "$MODEL" != *"Fire 3"* ]]; then
    warn "Expected DOOGEE Fire 3 Ultra, got: ${MODEL}"
    read -rp "  Continue anyway? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
fi

# ═══════════════════════════════════════════════════════════════
# STEP 2: Install ClawMiner APK
# ═══════════════════════════════════════════════════════════════
step 2 "Installing ClawMiner APK"

if [ ! -f "$APK_PATH" ]; then
    # Try to find it in the build output
    BUILD_APK="${SCRIPT_DIR}/../android/app/build/outputs/apk/debug/app-debug.apk"
    if [ -f "$BUILD_APK" ]; then
        APK_PATH="$BUILD_APK"
        info "Using build output: $(basename "$BUILD_APK")"
    else
        fail "clawminer.apk not found in ${SCRIPT_DIR}/"
        info "Build it first: Android Studio → Build → Build APK"
        info "Then copy to: ${SCRIPT_DIR}/clawminer.apk"
        exit 1
    fi
fi

APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
info "APK size: ${APK_SIZE}"

$ADB install -r "$APK_PATH" 2>&1 | while read -r line; do
    if [[ "$line" == *"Success"* ]]; then
        ok "ClawMiner installed"
    elif [[ "$line" == *"Failure"* ]]; then
        fail "Install failed: $line"
    fi
done

# Verify installation
if $ADB shell pm list packages | grep -q "com.b0ase.clawminer"; then
    APK_VER=$($ADB shell dumpsys package com.b0ase.clawminer | grep versionName | head -1 | awk -F= '{print $2}' | tr -d '\r')
    ok "Verified: com.b0ase.clawminer v${APK_VER}"
else
    fail "Package not found after install!"
    exit 1
fi

# ═══════════════════════════════════════════════════════════════
# STEP 3: Push wallpapers
# ═══════════════════════════════════════════════════════════════
step 3 "Pushing wallpapers"

$ADB shell mkdir -p /sdcard/ClawMiner-Wallpapers

WALL_COUNT=0
if [ -d "$WALLPAPER_DIR" ] && [ "$(ls -A "$WALLPAPER_DIR" 2>/dev/null)" ]; then
    for f in "$WALLPAPER_DIR"/*.jpg; do
        [ -f "$f" ] || continue
        $ADB push "$f" "/sdcard/ClawMiner-Wallpapers/$(basename "$f")" >/dev/null 2>&1
        WALL_COUNT=$((WALL_COUNT + 1))
    done
    ok "Pushed ${WALL_COUNT} wallpapers"
else
    warn "No wallpapers found in ${WALLPAPER_DIR}/"
    info "Copy .jpg files there to include them"
fi

# Trigger media scan
$ADB shell "for f in /sdcard/ClawMiner-Wallpapers/*.jpg; do am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d \"file://\$f\" > /dev/null 2>&1; done" 2>/dev/null
ok "Media scanner triggered"

# ═══════════════════════════════════════════════════════════════
# STEP 4: Set default wallpaper
# ═══════════════════════════════════════════════════════════════
step 4 "Setting wallpaper"

if [ -f "${WALLPAPER_DIR}/${DEFAULT_WALLPAPER}" ]; then
    # Push to a temp location and set via am
    $ADB push "${WALLPAPER_DIR}/${DEFAULT_WALLPAPER}" /sdcard/clawminer_wallpaper.jpg >/dev/null 2>&1
    # Use WallpaperManager via app_process — most reliable method without root
    $ADB shell "am start -a android.intent.action.ATTACH_DATA -d file:///sdcard/clawminer_wallpaper.jpg -t image/jpeg" >/dev/null 2>&1
    ok "Wallpaper picker opened with ${DEFAULT_WALLPAPER}"
    info "→ Manually confirm 'Set wallpaper' on device if prompted"
else
    warn "Default wallpaper not found: ${DEFAULT_WALLPAPER}"
    info "Place it in ${WALLPAPER_DIR}/"
fi

# ═══════════════════════════════════════════════════════════════
# STEP 5: Disable bloatware
# ═══════════════════════════════════════════════════════════════
step 5 "Disabling bloatware"

DISABLED=0
SKIPPED=0

if [ -f "$BLOATWARE_LIST" ]; then
    while IFS= read -r pkg; do
        # Skip comments and blank lines
        pkg=$(echo "$pkg" | sed 's/#.*//' | xargs)
        [ -z "$pkg" ] && continue

        if $ADB shell pm list packages | grep -q "package:${pkg}$"; then
            if $ADB shell pm disable-user --user 0 "$pkg" >/dev/null 2>&1; then
                DISABLED=$((DISABLED + 1))
            else
                SKIPPED=$((SKIPPED + 1))
            fi
        else
            SKIPPED=$((SKIPPED + 1))
        fi
    done < "$BLOATWARE_LIST"
    ok "Disabled ${DISABLED} packages (${SKIPPED} skipped/not found)"
else
    warn "bloatware.txt not found, skipping"
fi

# ═══════════════════════════════════════════════════════════════
# STEP 6: Configure device settings
# ═══════════════════════════════════════════════════════════════
step 6 "Configuring device settings"

# Screen timeout: 30 minutes (1800000ms) — device stays visible while mining
$ADB shell settings put system screen_off_timeout 1800000
ok "Screen timeout: 30 minutes"

# WiFi: never sleep (critical for mining — needs constant network)
$ADB shell settings put global wifi_sleep_policy 2
ok "WiFi sleep: never"

# Stay awake while charging (mining device will usually be plugged in)
$ADB shell settings put global stay_on_while_plugged_in 3
ok "Stay awake while charging: enabled"

# Reduce animations for snappier feel
$ADB shell settings put global window_animation_scale 0.5
$ADB shell settings put global transition_animation_scale 0.5
$ADB shell settings put global animator_duration_scale 0.5
ok "Animations: reduced (0.5x)"

# Disable auto-rotate (mining device sits in one position)
$ADB shell settings put system accelerometer_rotation 0
ok "Auto-rotate: disabled"

# Max brightness (if on a desk/shelf as a display piece)
$ADB shell settings put system screen_brightness_mode 0
$ADB shell settings put system screen_brightness 128
ok "Brightness: 50% manual"

# ═══════════════════════════════════════════════════════════════
# STEP 7: Rename device
# ═══════════════════════════════════════════════════════════════
step 7 "Renaming device"

DEVICE_NAME="ClawMiner-${SERIAL_SHORT}"
$ADB shell settings put global device_name "$DEVICE_NAME"
$ADB shell settings put secure bluetooth_name "$DEVICE_NAME"
ok "Device name: ${DEVICE_NAME}"

# ═══════════════════════════════════════════════════════════════
# STEP 8: Set ClawMiner as default launcher (optional kiosk mode)
# ═══════════════════════════════════════════════════════════════
step 8 "Launcher configuration"

# Grant all permissions to ClawMiner
$ADB shell pm grant com.b0ase.clawminer android.permission.POST_NOTIFICATIONS 2>/dev/null && \
    ok "Notification permission: granted" || warn "Could not grant notification permission"

# Launch ClawMiner to verify it works
$ADB shell am start -n com.b0ase.clawminer/.SplashActivity >/dev/null 2>&1
ok "ClawMiner launched"
info "→ Verify splash screen + dashboard on device"

# ═══════════════════════════════════════════════════════════════
# STEP 9: Log to manifest
# ═══════════════════════════════════════════════════════════════
step 9 "Logging to manifest"

DATE=$(date +"%Y-%m-%d %H:%M:%S")
echo "${SERIAL},${DEVICE_NAME},${DATE},${ANDROID_VER},${FIRMWARE},${APK_VER:-unknown},OK" >> "$MANIFEST"
ok "Logged to manifest.csv"

# ═══════════════════════════════════════════════════════════════
# DONE
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✓ ClawMiner provisioning complete!${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Device:    ${BOLD}${DEVICE_NAME}${NC}"
echo -e "  Serial:    ${DIM}${SERIAL}${NC}"
echo -e "  APK:       ${DIM}v${APK_VER:-unknown}${NC}"
echo -e "  Bloatware: ${DIM}${DISABLED} disabled${NC}"
echo -e "  Wallpapers:${DIM} ${WALL_COUNT} loaded${NC}"
echo ""
echo -e "  ${DIM}QC Checklist:${NC}"
echo -e "  ${DIM}  [ ] Splash screen shows orange crab${NC}"
echo -e "  ${DIM}  [ ] Dashboard displays mining stats${NC}"
echo -e "  ${DIM}  [ ] Notification shows claw icon${NC}"
echo -e "  ${DIM}  [ ] Wallpaper is set${NC}"
echo -e "  ${DIM}  [ ] Device name shows as ${DEVICE_NAME}${NC}"
echo ""
echo -e "  ${DIM}Unplug and box it. 📦${NC}"
echo ""
