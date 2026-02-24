#!/bin/bash
set -euo pipefail

# ClawMiner Desktop Builder
# Builds .app bundle for macOS and tarball for Linux

VERSION="${VERSION:-0.2.0}"
BUILD_DIR="./build"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$PROJECT_ROOT"

echo "=== ClawMiner Desktop Builder v${VERSION} ==="
echo ""

build_macos() {
    echo "[macOS] Building daemon..."
    GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 go build \
        -ldflags "-s -w -X main.Version=${VERSION}" \
        -o "${BUILD_DIR}/clawminerd" ./cmd/clawminerd/

    echo "[macOS] Building SwiftUI tray app..."
    SWIFT_DIR="./cmd/clawminer-tray-swift"
    swiftc -parse-as-library -O \
        -o "${BUILD_DIR}/clawminer-tray" \
        "${SWIFT_DIR}/ClawMinerApp.swift" \
        "${SWIFT_DIR}/MinerViewModel.swift" \
        "${SWIFT_DIR}/PopoverView.swift" \
        -framework AppKit -framework SwiftUI

    echo "[macOS] Creating .app bundle..."
    APP="${BUILD_DIR}/ClawMiner.app"
    rm -rf "$APP"
    mkdir -p "$APP/Contents/MacOS"
    mkdir -p "$APP/Contents/Resources"

    cp "${BUILD_DIR}/clawminer-tray" "$APP/Contents/MacOS/ClawMiner"
    cp "${BUILD_DIR}/clawminerd" "$APP/Contents/MacOS/"

    # Copy app icon if available
    if [ -f "assets/AppIcon.icns" ]; then
        cp "assets/AppIcon.icns" "$APP/Contents/Resources/"
    fi

    # Copy tray icon for status bar
    if [ -f "cmd/clawminer-tray/tray-icon.png" ]; then
        cp "cmd/clawminer-tray/tray-icon.png" "$APP/Contents/Resources/"
    fi

    # Info.plist
    cat > "$APP/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>ClawMiner</string>
    <key>CFBundleIdentifier</key>
    <string>com.b0ase.clawminer</string>
    <key>CFBundleName</key>
    <string>ClawMiner</string>
    <key>CFBundleDisplayName</key>
    <string>ClawMiner</string>
    <key>CFBundleVersion</key>
PLIST
    echo "    <string>${VERSION}</string>" >> "$APP/Contents/Info.plist"
    cat >> "$APP/Contents/Info.plist" << 'PLIST'
    <key>CFBundleShortVersionString</key>
PLIST
    echo "    <string>${VERSION}</string>" >> "$APP/Contents/Info.plist"
    cat >> "$APP/Contents/Info.plist" << 'PLIST'
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

    echo "[macOS] Creating distribution zip..."
    cd "${BUILD_DIR}"
    rm -f "ClawMiner-v${VERSION}-macOS-arm64.zip"
    zip -r "ClawMiner-v${VERSION}-macOS-arm64.zip" ClawMiner.app
    cd "$PROJECT_ROOT"

    echo "[macOS] Done: ${BUILD_DIR}/ClawMiner-v${VERSION}-macOS-arm64.zip"
    ls -lh "${BUILD_DIR}/ClawMiner-v${VERSION}-macOS-arm64.zip"
}

build_linux() {
    echo "[Linux] Building amd64 daemon (pure Go, no CGO)..."

    # Linux build: daemon only (no tray — systray needs GTK headers)
    # Uses modernc.org/sqlite (pure Go) via nocgo build tag
    CC_LINUX="x86_64-linux-musl-gcc"
    if command -v "$CC_LINUX" &>/dev/null; then
        GOOS=linux GOARCH=amd64 CGO_ENABLED=1 CC="$CC_LINUX" go build \
            -ldflags "-s -w -X main.Version=${VERSION} -linkmode external -extldflags '-static'" \
            -o "${BUILD_DIR}/clawminerd-linux" ./cmd/clawminerd/
    else
        echo "[Linux] No musl cross-compiler. Building with CGO_ENABLED=0 (pure Go SQLite)."
        GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build \
            -ldflags "-s -w -X main.Version=${VERSION}" \
            -o "${BUILD_DIR}/clawminerd-linux" ./cmd/clawminerd/
    fi

    echo "[Linux] Creating distribution tarball..."
    DIST="${BUILD_DIR}/clawminer-linux"
    rm -rf "$DIST"
    mkdir -p "$DIST"

    cp "${BUILD_DIR}/clawminerd-linux" "$DIST/clawminerd"

    # Install script
    cat > "$DIST/install.sh" << 'INSTALL'
#!/bin/bash
set -euo pipefail
echo "Installing ClawMiner..."
sudo cp clawminerd /usr/local/bin/
sudo chmod +x /usr/local/bin/clawminerd

# Create systemd user service
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/clawminer.service << 'SVC'
[Unit]
Description=ClawMiner $402 Token Miner
After=network.target

[Service]
ExecStart=/usr/local/bin/clawminerd
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
SVC

systemctl --user daemon-reload
systemctl --user enable clawminer
systemctl --user start clawminer

echo "ClawMiner installed and started!"
echo "  Dashboard: http://127.0.0.1:8402"
echo "  Logs: journalctl --user -u clawminer -f"
INSTALL
    chmod +x "$DIST/install.sh"

    cd "${BUILD_DIR}"
    rm -f "ClawMiner-v${VERSION}-linux-amd64.tar.gz"
    tar czf "ClawMiner-v${VERSION}-linux-amd64.tar.gz" clawminer-linux/
    cd "$PROJECT_ROOT"

    echo "[Linux] Done: ${BUILD_DIR}/ClawMiner-v${VERSION}-linux-amd64.tar.gz"
    ls -lh "${BUILD_DIR}/ClawMiner-v${VERSION}-linux-amd64.tar.gz"
}

checksums() {
    echo ""
    echo "[checksums] Generating SHA256 checksums..."
    cd "${BUILD_DIR}"
    shasum -a 256 ClawMiner-v${VERSION}-*.{zip,tar.gz} 2>/dev/null > "checksums-v${VERSION}.txt" || true
    cat "checksums-v${VERSION}.txt"
    cd "$PROJECT_ROOT"
}

# Parse arguments
case "${1:-all}" in
    macos)   mkdir -p "$BUILD_DIR"; build_macos ;;
    linux)   mkdir -p "$BUILD_DIR"; build_linux ;;
    all)     mkdir -p "$BUILD_DIR"; build_macos; echo ""; build_linux; checksums ;;
    *)       echo "Usage: $0 [macos|linux|all]"; exit 1 ;;
esac

echo ""
echo "=== Build complete ==="
