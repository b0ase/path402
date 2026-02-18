#!/usr/bin/env bash
#
# Cross-platform electron-builder wrapper
#
# Problem: @path402/htm → scrypt-ord → rabinsig → bigint-buffer uses node-gyp
# which cannot cross-compile native modules (e.g. macOS → Linux x64).
# These modules are externalized in esbuild and not needed at runtime.
#
# Solution: Temporarily stash the problematic native module chain from the
# hoisted node_modules before electron-builder runs @electron/rebuild,
# then restore them after packaging completes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$(dirname "$SCRIPT_DIR")"
MONO_ROOT="$(cd "$DESKTOP_DIR/../.." && pwd)"
STASH_DIR="/tmp/path402-native-stash-$$"

# Modules to stash (bigint-buffer and its ancestor chain from @path402/htm)
STASH_MODULES=(bigint-buffer rabinsig scrypt-ts-lib scrypt-ord)

# Detect target platform from args, default to current OS
TARGET="${1:---$(uname -s | tr '[:upper:]' '[:lower:]')}"
EXTRA_ARGS="${@:2}"

cleanup() {
  echo "[dist-cross] Restoring stashed modules..."
  for mod in "${STASH_MODULES[@]}"; do
    # Restore from monorepo root node_modules
    if [ -d "$STASH_DIR/root_$mod" ]; then
      mv "$STASH_DIR/root_$mod" "$MONO_ROOT/node_modules/$mod"
    fi
    # Restore from desktop node_modules
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

if is_cross_compile; then
  echo "[dist-cross] Cross-compilation detected (host: $(uname -s), target: $TARGET)"
  echo "[dist-cross] Stashing node-gyp modules that can't cross-compile..."
  mkdir -p "$STASH_DIR"

  for mod in "${STASH_MODULES[@]}"; do
    # Stash from monorepo root (hoisted)
    if [ -d "$MONO_ROOT/node_modules/$mod" ]; then
      mv "$MONO_ROOT/node_modules/$mod" "$STASH_DIR/root_$mod"
      echo "  stashed root: $mod"
    fi
    # Stash from desktop local
    if [ -d "$DESKTOP_DIR/node_modules/$mod" ]; then
      mv "$DESKTOP_DIR/node_modules/$mod" "$STASH_DIR/local_$mod"
      echo "  stashed local: $mod"
    fi
  done

  # Ensure cleanup runs even on failure
  trap cleanup EXIT
else
  echo "[dist-cross] Native compilation (host matches target: $TARGET)"
fi

echo "[dist-cross] Running: electron-builder $TARGET $EXTRA_ARGS"
cd "$DESKTOP_DIR"
npx electron-builder "$TARGET" $EXTRA_ARGS

echo "[dist-cross] Build complete."
