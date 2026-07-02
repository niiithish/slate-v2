#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_DIR="/opt/slate"
BIN_SRC="$ROOT/src-tauri/target/release/slate"
ICON_SRC="$ROOT/src-tauri/icons/icon.png"

echo "Building release with embedded frontend (tauri build --no-bundle)..."
(cd "$ROOT" && bun run tauri build --no-bundle)

if [[ ! -f "$BIN_SRC" ]]; then
  echo "Release binary missing after build." >&2
  exit 1
fi

sudo mkdir -p "$INSTALL_DIR"
sudo install -m 755 "$BIN_SRC" "$INSTALL_DIR/slate"
sudo install -m 644 "$ICON_SRC" "$INSTALL_DIR/icon.png"

mkdir -p "$HOME/.config/com.nithish.slate"
if [[ -f "$ROOT/.env.local" ]]; then
  install -m 600 "$ROOT/.env.local" "$HOME/.config/com.nithish.slate/.env"
fi

DESKTOP='[Desktop Entry]
Name=Slate
Comment=Personal routine and habit tracker
Exec=/opt/slate/slate
Icon=/opt/slate/icon.png
Terminal=false
Type=Application
Categories=Utility;Productivity;
StartupWMClass=slate
'

install -d "$HOME/.local/share/applications"
printf '%s\n' "$DESKTOP" > "$HOME/.local/share/applications/slate.desktop"
chmod 644 "$HOME/.local/share/applications/slate.desktop"

if [[ -d "$HOME/Desktop" ]]; then
  cp "$HOME/.local/share/applications/slate.desktop" "$HOME/Desktop/slate.desktop"
  chmod +x "$HOME/Desktop/slate.desktop"
fi

sudo tee /usr/share/applications/slate.desktop > /dev/null <<< "$DESKTOP"
sudo chmod 644 /usr/share/applications/slate.desktop

update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
sudo update-desktop-database /usr/share/applications 2>/dev/null || true

echo "Installed Slate to $INSTALL_DIR"
echo "Menu + desktop shortcut created."