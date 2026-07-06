#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_DIR="${SLATE_INSTALL_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/slate}"
ICON_SRC="$ROOT/src-tauri/icons/icon.png"

if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  echo "SKIP_BUILD=1 — reusing existing binary."
elif [[ "${FAST:-0}" == "1" ]]; then
  echo "FAST=1 — debug build (much quicker, not for shipping)."
  (cd "$ROOT" && bun run build:frontend && bun run tauri build --debug --no-bundle)
  BIN_SRC="$ROOT/src-tauri/target/debug/slate"
else
  if [[ -f "${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/slate.key}" ]]; then
    echo "Building signed release (tauri build --no-bundle)..."
    export TAURI_SIGNING_PRIVATE_KEY_PATH="${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/slate.key}"
    (cd "$ROOT" && bun run build:frontend && bun run tauri build --no-bundle)
  else
    echo "Building release with embedded frontend (tauri build --no-bundle)..."
    (cd "$ROOT" && bun run build:frontend && bun run tauri build --no-bundle)
  fi
  BIN_SRC="$ROOT/src-tauri/target/release/slate"
fi

if [[ "${SKIP_BUILD:-0}" != "1" && ! -f "$BIN_SRC" ]]; then
  echo "Binary missing after build: $BIN_SRC" >&2
  exit 1
fi

if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  if [[ -f "$ROOT/src-tauri/target/release/slate" ]]; then
    BIN_SRC="$ROOT/src-tauri/target/release/slate"
  elif [[ -f "$ROOT/src-tauri/target/debug/slate" ]]; then
    BIN_SRC="$ROOT/src-tauri/target/debug/slate"
  fi
fi

if [[ ! -f "$BIN_SRC" ]]; then
  echo "No slate binary found. Run a build first." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
install -m 755 "$BIN_SRC" "$INSTALL_DIR/slate"
install -m 644 "$ICON_SRC" "$INSTALL_DIR/icon.png"

mkdir -p "$HOME/.config/com.nithish.slate"
if [[ -f "$ROOT/.env.local" ]]; then
  install -m 600 "$ROOT/.env.local" "$HOME/.config/com.nithish.slate/.env"
fi

DESKTOP="[Desktop Entry]
Name=Slate
Comment=Personal routine and habit tracker
Exec=${INSTALL_DIR}/slate
Icon=${INSTALL_DIR}/icon.png
Terminal=false
Type=Application
Categories=Utility;Productivity;
StartupWMClass=slate
"

install -d "$HOME/.local/share/applications"
printf '%s\n' "$DESKTOP" > "$HOME/.local/share/applications/slate.desktop"
chmod 644 "$HOME/.local/share/applications/slate.desktop"

if [[ -d "$HOME/Desktop" ]]; then
  cp "$HOME/.local/share/applications/slate.desktop" "$HOME/Desktop/slate.desktop"
  chmod +x "$HOME/Desktop/slate.desktop"
fi

update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

echo "Installed Slate to $INSTALL_DIR"
echo "Menu + desktop shortcut created."
if [[ -d /opt/slate ]]; then
  echo ""
  echo "Note: an older root-owned install exists at /opt/slate."
  echo "Close Slate and launch from the menu again so in-app updates can replace the binary."
  echo "Optional cleanup: sudo rm -rf /opt/slate /usr/share/applications/slate.desktop"
fi