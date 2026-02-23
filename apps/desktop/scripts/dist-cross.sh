#!/usr/bin/env bash
#
# Cross-platform electron-builder wrapper
#
# Problem: Native modules (better-sqlite3, bigint-buffer, etc.) cannot be
# cross-compiled from macOS to Linux. @electron/rebuild uses the host
# toolchain, producing Mach-O binaries instead of ELF for Linux targets.
#
# Solution for Linux cross-compile:
#   1. Download the correct pre-built better-sqlite3 for linux-x64
#   2. Swap it into node_modules (saving the macOS original)
#   3. Stash other non-cross-compilable native modules
#   4. Run electron-builder with npmRebuild disabled
#   5. Restore everything
#
# If Docker is available, it's used instead (more reliable for complex cases).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$(dirname "$SCRIPT_DIR")"
MONO_ROOT="$(cd "$DESKTOP_DIR/../.." && pwd)"
STASH_DIR="/tmp/path402-native-stash-$$"

# Modules to stash (bigint-buffer and its ancestor chain from @b0ase/path402-htm)
STASH_MODULES=(bigint-buffer rabinsig scrypt-ts-lib scrypt-ord)

# Detect target platform from args, default to current OS
TARGET="${1:---$(uname -s | tr '[:upper:]' '[:lower:]')}"
EXTRA_ARGS="${@:2}"

# ── Version detection ──────────────────────────────────────────────
get_electron_version() {
  node -e "console.log(require('$MONO_ROOT/node_modules/electron/package.json').version)"
}

get_electron_abi() {
  local ev
  ev="$(get_electron_version)"
  local major="${ev%%.*}"
  # Map Electron major → module version (ABI)
  # https://www.electronjs.org/docs/latest/tutorial/electron-timelines
  case "$major" in
    33) echo 130 ;;
    34) echo 132 ;;
    35) echo 133 ;;
    36) echo 135 ;;
    *) echo "unknown"; return 1 ;;
  esac
}

get_better_sqlite3_version() {
  node -e "console.log(require('$MONO_ROOT/node_modules/better-sqlite3/package.json').version)"
}

# ── Cleanup ────────────────────────────────────────────────────────
cleanup() {
  echo "[dist-cross] Restoring stashed modules..."

  # Restore better-sqlite3 native binary
  if [ -f "$STASH_DIR/better_sqlite3_original.node" ]; then
    local sqlite_dir
    sqlite_dir="$(find_better_sqlite3_dir)"
    if [ -n "$sqlite_dir" ]; then
      mv "$STASH_DIR/better_sqlite3_original.node" "$sqlite_dir/build/Release/better_sqlite3.node"
      echo "  restored: better-sqlite3 macOS binary"
    fi
  fi

  for mod in "${STASH_MODULES[@]}"; do
    if [ -d "$STASH_DIR/root_$mod" ]; then
      mv "$STASH_DIR/root_$mod" "$MONO_ROOT/node_modules/$mod"
    fi
    if [ -d "$STASH_DIR/local_$mod" ]; then
      mv "$STASH_DIR/local_$mod" "$DESKTOP_DIR/node_modules/$mod"
    fi
  done

  rm -rf "$STASH_DIR"
  echo "[dist-cross] Modules restored."
}

is_cross_compile() {
  local host_os
  host_os="$(uname -s)"
  case "$TARGET" in
    --linux)  [ "$host_os" != "Linux" ] && return 0 ;;
    --win)    [ "$host_os" != "MINGW"* ] && [ "$host_os" != "MSYS"* ] && return 0 ;;
    --mac)    [ "$host_os" != "Darwin" ] && return 0 ;;
  esac
  return 1
}

find_better_sqlite3_dir() {
  # Check desktop local first, then monorepo root (hoisted)
  if [ -d "$DESKTOP_DIR/node_modules/better-sqlite3" ]; then
    echo "$DESKTOP_DIR/node_modules/better-sqlite3"
  elif [ -d "$MONO_ROOT/node_modules/better-sqlite3" ]; then
    echo "$MONO_ROOT/node_modules/better-sqlite3"
  fi
}

# ── Linux cross-compile: prebuild download approach ────────────────
linux_cross_compile() {
  echo "[dist-cross] Linux cross-compilation detected (host: $(uname -s))"

  # Check for Docker first (most reliable)
  if command -v docker &>/dev/null; then
    echo "[dist-cross] Docker available — using container build for best results"
    docker_build
    return $?
  fi

  echo "[dist-cross] Docker not available — using prebuild download approach"

  local sqlite_version abi sqlite_dir
  sqlite_version="$(get_better_sqlite3_version)"
  abi="$(get_electron_abi)"

  if [ "$abi" = "unknown" ]; then
    echo "[dist-cross] ERROR: Unknown Electron ABI for $(get_electron_version)"
    echo "[dist-cross] Install Docker or build on a Linux machine."
    exit 1
  fi

  sqlite_dir="$(find_better_sqlite3_dir)"
  if [ -z "$sqlite_dir" ]; then
    echo "[dist-cross] ERROR: better-sqlite3 not found in node_modules"
    exit 1
  fi

  echo "[dist-cross] better-sqlite3 v${sqlite_version}, Electron ABI v${abi}"

  # Download the linux-x64 prebuild
  local prebuild_name="better-sqlite3-v${sqlite_version}-electron-v${abi}-linux-x64.tar.gz"
  local prebuild_url="https://github.com/JoshuaWise/better-sqlite3/releases/download/v${sqlite_version}/${prebuild_name}"
  local tmp_prebuild="/tmp/path402-prebuild-$$"

  echo "[dist-cross] Downloading prebuild: ${prebuild_name}..."
  mkdir -p "$tmp_prebuild"
  if ! curl -fsSL "$prebuild_url" -o "$tmp_prebuild/prebuild.tar.gz"; then
    echo "[dist-cross] ERROR: Failed to download prebuild from:"
    echo "  $prebuild_url"
    echo ""
    echo "[dist-cross] Try one of:"
    echo "  1. Install Docker Desktop and re-run"
    echo "  2. Build on the Linux machine: pnpm --filter @b0ase/path402-desktop dist"
    exit 1
  fi

  # Extract prebuild
  tar xzf "$tmp_prebuild/prebuild.tar.gz" -C "$tmp_prebuild"
  local prebuild_node="$tmp_prebuild/build/Release/better_sqlite3.node"
  if [ ! -f "$prebuild_node" ]; then
    echo "[dist-cross] ERROR: Prebuild archive didn't contain expected .node file"
    rm -rf "$tmp_prebuild"
    exit 1
  fi

  # Verify it's actually a Linux ELF binary
  if ! file "$prebuild_node" | grep -q "ELF"; then
    echo "[dist-cross] ERROR: Downloaded prebuild is not an ELF binary"
    file "$prebuild_node"
    rm -rf "$tmp_prebuild"
    exit 1
  fi

  echo "[dist-cross] ✓ Downloaded linux-x64 ELF binary"

  mkdir -p "$STASH_DIR"
  trap cleanup EXIT

  # Save macOS binary and swap in linux prebuild
  cp "$sqlite_dir/build/Release/better_sqlite3.node" "$STASH_DIR/better_sqlite3_original.node"
  cp "$prebuild_node" "$sqlite_dir/build/Release/better_sqlite3.node"
  echo "[dist-cross] Swapped better-sqlite3 binary (macOS → linux-x64)"

  rm -rf "$tmp_prebuild"

  # Stash other non-cross-compilable modules
  echo "[dist-cross] Stashing node-gyp modules that can't cross-compile..."
  for mod in "${STASH_MODULES[@]}"; do
    if [ -d "$MONO_ROOT/node_modules/$mod" ]; then
      mv "$MONO_ROOT/node_modules/$mod" "$STASH_DIR/root_$mod"
      echo "  stashed root: $mod"
    fi
    if [ -d "$DESKTOP_DIR/node_modules/$mod" ]; then
      mv "$DESKTOP_DIR/node_modules/$mod" "$STASH_DIR/local_$mod"
      echo "  stashed local: $mod"
    fi
  done

  # Run electron-builder with npm rebuild DISABLED
  # (we already have the correct prebuild in place)
  echo "[dist-cross] Running: electron-builder --linux --c.npmRebuild=false $EXTRA_ARGS"
  cd "$DESKTOP_DIR"
  npx electron-builder --linux --c.npmRebuild=false $EXTRA_ARGS

  echo "[dist-cross] Linux build complete."
}

# ── Docker build (fallback) ────────────────────────────────────────
docker_build() {
  local dockerfile="$SCRIPT_DIR/Dockerfile.linux"
  if [ ! -f "$dockerfile" ]; then
    echo "[dist-cross] ERROR: $dockerfile not found"
    return 1
  fi

  echo "[dist-cross] Building Docker image..."
  docker build -f "$dockerfile" -t path402-linux-builder "$MONO_ROOT"

  mkdir -p "$DESKTOP_DIR/release"
  docker run --rm \
    -v "$DESKTOP_DIR/release:/out" \
    path402-linux-builder

  echo "[dist-cross] Docker build complete. Artifacts in apps/desktop/release/"
}

# ── Main ───────────────────────────────────────────────────────────

if [ "$TARGET" = "--linux" ] && is_cross_compile; then
  linux_cross_compile
  exit 0
fi

# Non-Linux cross-compile or native build
if is_cross_compile; then
  echo "[dist-cross] Cross-compilation detected (host: $(uname -s), target: $TARGET)"
  echo "[dist-cross] Stashing node-gyp modules that can't cross-compile..."
  mkdir -p "$STASH_DIR"
  trap cleanup EXIT

  for mod in "${STASH_MODULES[@]}"; do
    if [ -d "$MONO_ROOT/node_modules/$mod" ]; then
      mv "$MONO_ROOT/node_modules/$mod" "$STASH_DIR/root_$mod"
      echo "  stashed root: $mod"
    fi
    if [ -d "$DESKTOP_DIR/node_modules/$mod" ]; then
      mv "$DESKTOP_DIR/node_modules/$mod" "$STASH_DIR/local_$mod"
      echo "  stashed local: $mod"
    fi
  done
else
  echo "[dist-cross] Native compilation (host matches target: $TARGET)"
fi

echo "[dist-cross] Running: electron-builder $TARGET $EXTRA_ARGS"
cd "$DESKTOP_DIR"
npx electron-builder "$TARGET" $EXTRA_ARGS

echo "[dist-cross] Build complete."
