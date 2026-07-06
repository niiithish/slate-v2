#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE_DIR="$ROOT/src-tauri/android-templates"
MAIN_ACTIVITY="$ROOT/src-tauri/gen/android/app/src/main/java/com/nithish/slate/MainActivity.kt"
RES_DIR="$ROOT/src-tauri/gen/android/app/src/main/res"

if [[ ! -f "$TEMPLATE_DIR/MainActivity.kt" ]]; then
  echo "Missing MainActivity template: $TEMPLATE_DIR/MainActivity.kt" >&2
  exit 1
fi

if [[ ! -d "$(dirname "$MAIN_ACTIVITY")" ]]; then
  echo "Android project not initialized: $MAIN_ACTIVITY" >&2
  exit 1
fi

cp "$TEMPLATE_DIR/MainActivity.kt" "$MAIN_ACTIVITY"

if [[ -d "$TEMPLATE_DIR/res" ]]; then
  cp -R "$TEMPLATE_DIR/res/." "$RES_DIR/"
fi

MANIFEST="$ROOT/src-tauri/gen/android/app/src/main/AndroidManifest.xml"
if [[ -f "$MANIFEST" ]] && ! grep -q 'REQUEST_INSTALL_PACKAGES' "$MANIFEST"; then
  sed -i '/<uses-permission android:name="android.permission.INTERNET" \/>/a\
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />' "$MANIFEST"
fi

echo "Synced Android system bar templates."