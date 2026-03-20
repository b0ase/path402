#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  ClawMiner FULL Provisioning Script
#  One-shot: stock DOOGEE → fully loaded ClawMiner unit
#
#  Prerequisites:
#    1. Gmail created for this device (see CLAWMINER-SETUP-GUIDE.pdf)
#    2. Phone booted, signed into Gmail, USB debugging ON
#    3. Phone plugged in via USB-C, "Allow USB debugging" tapped
#
#  Usage:
#    ./provision-full.sh
#    ./provision-full.sh --skip-apps     # Skip sideloading (already installed)
#    ./provision-full.sh --skip-bloat    # Skip bloatware removal
#    ./provision-full.sh --lockdown      # Also disable USB debugging at end
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APKS_DIR="${SCRIPT_DIR}/apks"
WALLPAPER_DIR="${SCRIPT_DIR}/wallpapers"
DEFAULT_WALLPAPER="clawminer-pcb-claw-clean.jpg"
BLOATWARE_LIST="${SCRIPT_DIR}/bloatware.txt"
MANIFEST="${SCRIPT_DIR}/manifest.csv"
TERMUX_SETUP="${SCRIPT_DIR}/termux-bootstrap.sh"

# Parse flags
SKIP_APPS=false
SKIP_BLOAT=false
LOCKDOWN=false
for arg in "$@"; do
    case $arg in
        --skip-apps)  SKIP_APPS=true ;;
        --skip-bloat) SKIP_BLOAT=true ;;
        --lockdown)   LOCKDOWN=true ;;
    esac
done

# Colors
ORANGE='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
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

# Helpers
TOTAL_STEPS=11
step() { echo -e "\n${ORANGE}[$1/${TOTAL_STEPS}]${NC} ${BOLD}$2${NC}"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${ORANGE}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
info() { echo -e "  ${DIM}$1${NC}"; }

# ─────────────────────────────────────────────────────────────
banner() {
    echo ""
    echo -e "${ORANGE}${BOLD}"
    echo "   ╔═════════════════════════════════════════════╗"
    echo "   ║     🦀 ClawMiner FULL Provisioning Tool     ║"
    echo "   ║     One shot. Plug in. Walk away.           ║"
    echo "   ╚═════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo -e "  ${DIM}Flags: apps=$([ "$SKIP_APPS" = true ] && echo "skip" || echo "install") bloat=$([ "$SKIP_BLOAT" = true ] && echo "skip" || echo "remove") lockdown=$([ "$LOCKDOWN" = true ] && echo "yes" || echo "no")${NC}"
}

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
    fail "Multiple devices connected. Plug in only one at a time."
    $ADB devices
    exit 1
fi

SERIAL=$($ADB get-serialno)
MODEL=$($ADB shell getprop ro.product.model | tr -d '\r')
BRAND=$($ADB shell getprop ro.product.brand | tr -d '\r')
ANDROID_VER=$($ADB shell getprop ro.build.version.release | tr -d '\r')
SDK_VER=$($ADB shell getprop ro.build.version.sdk | tr -d '\r')
FIRMWARE=$($ADB shell getprop ro.build.display.id | tr -d '\r')
SERIAL_SHORT="${SERIAL: -4}"
DEVICE_NAME="ClawMiner-${SERIAL_SHORT}"

ok "Connected: ${BRAND} ${MODEL}"
info "Serial: ${SERIAL}"
info "Android: ${ANDROID_VER} (SDK ${SDK_VER}) | Firmware: ${FIRMWARE}"

info "Model: ${BRAND} ${MODEL}"
if [[ "$MODEL" != *"Fire 3"* ]]; then
    warn "This isn't a DOOGEE Fire 3 Ultra — that's fine, script works on any Android device"
fi

# Check storage
STORAGE_AVAIL=$($ADB shell df /data 2>/dev/null | tail -1 | awk '{print $4}')
info "Storage available: ${STORAGE_AVAIL}"

# ═══════════════════════════════════════════════════════════════
# STEP 2: Disable bloatware
# ═══════════════════════════════════════════════════════════════
step 2 "Disabling bloatware"

if [ "$SKIP_BLOAT" = true ]; then
    info "Skipped (--skip-bloat)"
else
    DISABLED=0
    SKIPPED=0

    # Cache installed packages once (much faster than querying per-package)
    ALL_PKGS=$($ADB shell pm list packages -e 2>/dev/null)

    # Phase 1: Disable everything in bloatware.txt
    if [ -f "$BLOATWARE_LIST" ]; then
        while IFS= read -r pkg; do
            pkg=$(echo "$pkg" | sed 's/#.*//' | xargs)
            [ -z "$pkg" ] && continue

            if echo "$ALL_PKGS" | grep -q "package:${pkg}$"; then
                if $ADB shell pm disable-user --user 0 "$pkg" >/dev/null 2>&1; then
                    DISABLED=$((DISABLED + 1))
                else
                    SKIPPED=$((SKIPPED + 1))
                fi
            else
                SKIPPED=$((SKIPPED + 1))
            fi
        done < "$BLOATWARE_LIST"
        ok "Bloatware list: ${DISABLED} disabled (${SKIPPED} skipped/not found)"
    else
        warn "bloatware.txt not found"
    fi

    # Phase 2: Auto-scan for OEM bloatware not in the list
    # Catches manufacturer packages on any Chinese Android device
    AUTO_DISABLED=0
    BRAND_LOWER=$(echo "$BRAND" | tr '[:upper:]' '[:lower:]')

    # Detect OEM-specific package prefixes based on brand
    OEM_PATTERNS="com.${BRAND_LOWER}."
    # Also scan common diagnostic/factory patterns
    SCAN_PATTERNS="engineermode|factorytest|phonetest|factorymode|validationtools|logmanager"

    info "Auto-scanning for OEM bloatware (brand: ${BRAND})..."
    while IFS= read -r line; do
        pkg=$(echo "$line" | sed 's/package://')

        # Skip if already disabled in Phase 1
        grep -q "^${pkg}$" "$BLOATWARE_LIST" 2>/dev/null && continue

        # Check if it matches OEM or diagnostic patterns
        if echo "$pkg" | grep -qE "${SCAN_PATTERNS}"; then
            if $ADB shell pm disable-user --user 0 "$pkg" >/dev/null 2>&1; then
                ok "Auto-disabled: $pkg"
                AUTO_DISABLED=$((AUTO_DISABLED + 1))
            fi
        fi
    done <<< "$ALL_PKGS"

    if [ "$AUTO_DISABLED" -gt 0 ]; then
        ok "Auto-scan: ${AUTO_DISABLED} additional packages disabled"
    else
        info "Auto-scan: no additional bloatware found"
    fi
fi

# ═══════════════════════════════════════════════════════════════
# STEP 3: Install ClawMiner APK
# ═══════════════════════════════════════════════════════════════
step 3 "Installing ClawMiner APK"

CLAWMINER_APK="${APKS_DIR}/clawminer.apk"
if [ ! -f "$CLAWMINER_APK" ]; then
    # Fallback to build output
    BUILD_APK="${SCRIPT_DIR}/../android/app/build/outputs/apk/debug/app-debug.apk"
    if [ -f "$BUILD_APK" ]; then
        CLAWMINER_APK="$BUILD_APK"
    else
        fail "clawminer.apk not found in ${APKS_DIR}/"
        info "Download from clawminer.store/downloads or build from source"
        exit 1
    fi
fi

APK_SIZE=$(du -h "$CLAWMINER_APK" | cut -f1)
info "APK size: ${APK_SIZE}"

if $ADB shell pm list packages 2>/dev/null | grep -q "com.b0ase.clawminer"; then
    info "ClawMiner already installed, reinstalling..."
fi

$ADB install -r "$CLAWMINER_APK" 2>&1 | while read -r line; do
    if [[ "$line" == *"Success"* ]]; then
        ok "ClawMiner installed"
    elif [[ "$line" == *"Failure"* ]]; then
        fail "Install failed: $line"
    fi
done

APK_VER=$($ADB shell dumpsys package com.b0ase.clawminer 2>/dev/null | grep versionName | head -1 | awk -F= '{print $2}' | tr -d '\r')
ok "Verified: com.b0ase.clawminer v${APK_VER:-unknown}"

# ═══════════════════════════════════════════════════════════════
# STEP 4: Sideload all apps
# ═══════════════════════════════════════════════════════════════
step 4 "Sideloading apps"

if [ "$SKIP_APPS" = true ]; then
    info "Skipped (--skip-apps)"
else
    if [ ! -d "$APKS_DIR" ]; then
        warn "No apks/ directory found. Skipping sideload."
    else
        INSTALLED=0
        FAILED=0
        ALREADY=0

        # Map APK filenames to package names for skip-if-installed check
        declare -A APK_PACKAGES=(
            ["handcash-wallet.apk"]="io.handcash.wallet"
            ["metamask.apk"]="io.metamask"
            ["phantom.apk"]="app.phantom"
            ["anthropic-claude.apk"]="com.anthropic.claude"
            ["openchatgpt.apk"]="com.openai.chatgpt"
            ["microsoft-copilot.apk"]="com.microsoft.copilot"
            ["mistral-chat.apk"]="ai.mistral.chat"
            ["perplexity-android.apk"]="ai.perplexity.app.android"
            ["google-android-apps-labs-language-tailwind.apk"]="com.google.android.apps.labs.language.tailwind"
            ["github-android.apk"]="com.github.android"
            ["replit-app.apk"]="com.replit.app"
            ["notion-id.apk"]="notion.id"
            ["butterfly-app.apk"]="tech.butterfly.app"
            ["termux.apk"]="com.termux"
            ["whatsapp.apk"]="com.whatsapp"
            ["zhiliaomusically.apk"]="com.zhiliaoapp.musically"
            ["suno-android.apk"]="com.suno.android"
            ["revcel-mobile.apk"]="com.revcel.mobile"
        )

        # Get list of installed packages once
        INSTALLED_PKGS=$($ADB shell pm list packages 2>/dev/null)

        for apk_file in "$APKS_DIR"/*.apk; do
            [ -f "$apk_file" ] || continue
            fname=$(basename "$apk_file")

            # Skip clawminer (already installed in step 3)
            [ "$fname" = "clawminer.apk" ] && continue

            # Check if already installed
            pkg="${APK_PACKAGES[$fname]:-}"
            if [ -n "$pkg" ] && echo "$INSTALLED_PKGS" | grep -q "package:${pkg}$"; then
                ALREADY=$((ALREADY + 1))
                continue
            fi

            apk_sz=$(du -h "$apk_file" | cut -f1)
            echo -ne "  ${DIM}Installing ${fname} (${apk_sz})...${NC}"

            if $ADB install -r "$apk_file" >/dev/null 2>&1; then
                echo -e "\r  ${GREEN}✓${NC} ${fname} (${apk_sz})          "
                INSTALLED=$((INSTALLED + 1))
            else
                echo -e "\r  ${RED}✗${NC} ${fname} FAILED          "
                FAILED=$((FAILED + 1))
            fi
        done

        ok "Installed: ${INSTALLED} new, ${ALREADY} already present, ${FAILED} failed"
    fi
fi

# ═══════════════════════════════════════════════════════════════
# STEP 5: Push wallpapers
# ═══════════════════════════════════════════════════════════════
step 5 "Pushing wallpapers"

$ADB shell mkdir -p /sdcard/ClawMiner-Wallpapers 2>/dev/null

WALL_COUNT=0
if [ -d "$WALLPAPER_DIR" ] && [ "$(ls -A "$WALLPAPER_DIR" 2>/dev/null)" ]; then
    for f in "$WALLPAPER_DIR"/*.jpg; do
        [ -f "$f" ] || continue
        $ADB push "$f" "/sdcard/ClawMiner-Wallpapers/$(basename "$f")" >/dev/null 2>&1
        WALL_COUNT=$((WALL_COUNT + 1))
    done
    ok "Pushed ${WALL_COUNT} wallpapers"

    # Trigger media scan
    $ADB shell "for f in /sdcard/ClawMiner-Wallpapers/*.jpg; do am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d \"file://\$f\" > /dev/null 2>&1; done" 2>/dev/null
else
    warn "No wallpapers found in ${WALLPAPER_DIR}/"
fi

# Set default wallpaper
if [ -f "${WALLPAPER_DIR}/${DEFAULT_WALLPAPER}" ]; then
    $ADB push "${WALLPAPER_DIR}/${DEFAULT_WALLPAPER}" /sdcard/clawminer_wallpaper.jpg >/dev/null 2>&1
    $ADB shell "am start -a android.intent.action.ATTACH_DATA -d file:///sdcard/clawminer_wallpaper.jpg -t image/jpeg" >/dev/null 2>&1
    ok "Wallpaper picker opened — confirm on device if prompted"
fi

# ═══════════════════════════════════════════════════════════════
# STEP 6: Configure device settings
# ═══════════════════════════════════════════════════════════════
step 6 "Configuring device settings"

# Screen timeout: 30 minutes (mining device stays on)
$ADB shell settings put system screen_off_timeout 1800000
ok "Screen timeout: 30 minutes"

# WiFi: never sleep
$ADB shell settings put global wifi_sleep_policy 2
ok "WiFi sleep: never"

# Stay awake while charging
$ADB shell settings put global stay_on_while_plugged_in 3
ok "Stay awake while charging: ON"

# Reduce animations
$ADB shell settings put global window_animation_scale 0.5
$ADB shell settings put global transition_animation_scale 0.5
$ADB shell settings put global animator_duration_scale 0.5
ok "Animations: 0.5x"

# Disable auto-rotate
$ADB shell settings put system accelerometer_rotation 0
ok "Auto-rotate: OFF"

# Brightness 50%
$ADB shell settings put system screen_brightness_mode 0
$ADB shell settings put system screen_brightness 128
ok "Brightness: 50% manual"

# ═══════════════════════════════════════════════════════════════
# STEP 7: Rename device
# ═══════════════════════════════════════════════════════════════
step 7 "Renaming device"

$ADB shell settings put global device_name "$DEVICE_NAME"
$ADB shell settings put secure bluetooth_name "$DEVICE_NAME"
ok "Device name: ${DEVICE_NAME}"

# ═══════════════════════════════════════════════════════════════
# STEP 8: Grant permissions & launch ClawMiner
# ═══════════════════════════════════════════════════════════════
step 8 "Launching ClawMiner"

$ADB shell pm grant com.b0ase.clawminer android.permission.POST_NOTIFICATIONS 2>/dev/null && \
    ok "Notification permission: granted" || warn "Could not grant notification permission"

$ADB shell am start -n com.b0ase.clawminer/.SplashActivity >/dev/null 2>&1
ok "ClawMiner launched — verify dashboard on device"

# ═══════════════════════════════════════════════════════════════
# STEP 9: Push Termux bootstrap script
# ═══════════════════════════════════════════════════════════════
step 9 "Setting up Termux bootstrap"

# Create the bootstrap script that user runs on first Termux open
cat > /tmp/termux-bootstrap.sh << 'TERMUX_EOF'
#!/data/data/com.termux/files/usr/bin/bash
# ClawMiner Termux Bootstrap — run this once after first Termux launch
echo "🦀 ClawMiner dev tools setup..."
pkg update -y && pkg upgrade -y
pkg install -y git curl nodejs-lts openssh
echo ""
echo "Verifying installs..."
echo "  git:  $(git --version 2>/dev/null || echo 'FAILED')"
echo "  curl: $(curl --version 2>/dev/null | head -1 || echo 'FAILED')"
echo "  node: $(node --version 2>/dev/null || echo 'FAILED')"
echo "  npm:  $(npm --version 2>/dev/null || echo 'FAILED')"
echo "  ssh:  $(ssh -V 2>&1 || echo 'FAILED')"
echo ""
echo "✓ Done! Dev tools ready."
TERMUX_EOF

$ADB push /tmp/termux-bootstrap.sh /sdcard/termux-bootstrap.sh >/dev/null 2>&1
ok "Pushed termux-bootstrap.sh to /sdcard/"
info "→ First Termux launch: run 'bash /sdcard/termux-bootstrap.sh'"

# ═══════════════════════════════════════════════════════════════
# STEP 10: Log to manifest
# ═══════════════════════════════════════════════════════════════
step 10 "Logging to manifest"

DATE=$(date +"%Y-%m-%d %H:%M:%S")

# Create header if manifest is new
if [ ! -f "$MANIFEST" ] || [ ! -s "$MANIFEST" ]; then
    echo "serial,device_name,date,android,firmware,apk_version,gmail,status" > "$MANIFEST"
fi

# Prompt for Gmail (used to track which account is on this device)
echo ""
read -rp "  Gmail for this device (e.g. ClawMiner-1b@gmail.com): " DEVICE_GMAIL
DEVICE_GMAIL="${DEVICE_GMAIL:-unset}"

echo "${SERIAL},${DEVICE_NAME},${DATE},${ANDROID_VER},${FIRMWARE},${APK_VER:-unknown},${DEVICE_GMAIL},OK" >> "$MANIFEST"
ok "Logged to manifest.csv"

# ═══════════════════════════════════════════════════════════════
# STEP 11: Final lockdown (optional)
# ═══════════════════════════════════════════════════════════════
step 11 "Final lockdown"

if [ "$LOCKDOWN" = true ]; then
    warn "Disabling USB debugging — you won't be able to adb after this!"
    read -rp "  Are you sure? This is the last step before boxing. [y/N] " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        $ADB shell settings put global development_settings_enabled 0
        $ADB shell settings put global adb_enabled 0
        ok "Developer options: DISABLED"
        ok "USB debugging: DISABLED"
        info "Device is now locked down for shipping"
    else
        info "Skipped lockdown"
    fi
else
    info "Skipped (use --lockdown to disable USB debugging before boxing)"
fi

# ═══════════════════════════════════════════════════════════════
# DONE
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✓ ClawMiner FULL provisioning complete!${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Device:     ${BOLD}${DEVICE_NAME}${NC}"
echo -e "  Serial:     ${DIM}${SERIAL}${NC}"
echo -e "  Gmail:      ${DIM}${DEVICE_GMAIL}${NC}"
echo -e "  APK:        ${DIM}v${APK_VER:-unknown}${NC}"
echo -e "  Android:    ${DIM}${ANDROID_VER} (SDK ${SDK_VER})${NC}"
echo -e "  Bloatware:  ${DIM}${DISABLED:-skipped} disabled${NC}"
echo -e "  Wallpapers: ${DIM}${WALL_COUNT} loaded${NC}"
echo -e "  Lockdown:   ${DIM}$([ "$LOCKDOWN" = true ] && echo "YES" || echo "no")${NC}"
echo ""
echo -e "  ${BLUE}${BOLD}QC Checklist:${NC}"
echo -e "  ${DIM}  [ ] ClawMiner dashboard shows mining stats${NC}"
echo -e "  ${DIM}  [ ] HandCash installed${NC}"
echo -e "  ${DIM}  [ ] MetaMask installed${NC}"
echo -e "  ${DIM}  [ ] Phantom installed${NC}"
echo -e "  ${DIM}  [ ] Claude installed${NC}"
echo -e "  ${DIM}  [ ] Termux installed${NC}"
echo -e "  ${DIM}  [ ] WhatsApp installed${NC}"
echo -e "  ${DIM}  [ ] TikTok installed${NC}"
echo -e "  ${DIM}  [ ] Wallpaper set${NC}"
echo -e "  ${DIM}  [ ] Device name: ${DEVICE_NAME}${NC}"
echo -e "  ${DIM}  [ ] Battery > 80%${NC}"
echo ""
echo -e "  ${DIM}When QC passes: ./provision-full.sh --lockdown${NC}"
echo -e "  ${DIM}Then unplug and box it. 📦${NC}"
echo ""
