#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK_DIR="$ROOT/src-tauri/gen/android/app/build/outputs/apk/universal/release"

for candidate in \
  "$APK_DIR/app-universal-release.apk" \
  "$APK_DIR/app-universal-release-unsigned.apk"; do
  if [[ -f "$candidate" ]]; then
    cp "$candidate" "$ROOT/slate-android.apk"
    echo "Exported $candidate → $ROOT/slate-android.apk"
    exit 0
  fi
done

echo "No APK found in $APK_DIR" >&2
exit 1