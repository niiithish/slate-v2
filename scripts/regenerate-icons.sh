#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SOURCE_SVG="$ROOT/src-tauri/icons/logo-source.svg"
ICON_PNG="$ROOT/src-tauri/icons/icon.png"
ANDROID_BG="$ROOT/src-tauri/gen/android/app/src/main/res/values/ic_launcher_background.xml"

echo "Rendering transparent icon from logo-source.svg..."
rsvg-convert -w 1024 -h 1024 "$SOURCE_SVG" -o "$ICON_PNG"

echo "Generating platform icon sets..."
bun run tauri icon "$ICON_PNG"

mkdir -p "$(dirname "$ANDROID_BG")"
cat > "$ANDROID_BG" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">#00000000</color>
</resources>
EOF

echo "Icons regenerated with transparent background."