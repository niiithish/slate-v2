#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found. Install android-tools (Arch: pacman -S android-tools)." >&2
  exit 1
fi

mapfile -t devices < <(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')
if ((${#devices[@]} == 0)); then
  echo "No Android device connected." >&2
  echo "USB: enable developer options + USB debugging, then plug in the phone." >&2
  echo "Wi-Fi: adb pair <ip>:<port> && adb connect <ip>:5555" >&2
  exit 1
fi

if ((${#devices[@]} > 1)); then
  echo "Multiple devices detected; using ${devices[0]}"
  export ANDROID_SERIAL="${devices[0]}"
fi

echo "Building signed APK (keep Wireless debugging on during this)..."
bash "$ROOT/scripts/build-android.sh"

echo "Installing..."
bash "$ROOT/scripts/install-android.sh"