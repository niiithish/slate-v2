#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK_DIR="$ROOT/src-tauri/gen/android/app/build/outputs/apk/universal/release"
SIGNED_APK="$APK_DIR/app-universal-release.apk"
UNSIGNED_APK="$APK_DIR/app-universal-release-unsigned.apk"

if [[ -f "$SIGNED_APK" ]]; then
  cp "$SIGNED_APK" "$ROOT/slate-android.apk"
  echo "Exported signed APK → $ROOT/slate-android.apk"
  exit 0
fi

if [[ -f "$UNSIGNED_APK" ]]; then
  echo "Found unsigned APK only. Run scripts/setup-android-signing.sh first." >&2
  exit 1
fi

echo "No APK found in $APK_DIR" >&2
exit 1