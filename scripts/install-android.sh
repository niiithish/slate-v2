#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="$ROOT/slate-android.apk"
ADB="${ADB:-$HOME/Android/Sdk/platform-tools/adb}"

if [[ ! -x "$ADB" ]]; then
  ADB="$(command -v adb || true)"
fi

if [[ -z "$ADB" ]]; then
  echo "adb not found. Install android-tools or set ANDROID_HOME." >&2
  exit 1
fi

if [[ ! -f "$APK" ]]; then
  echo "No APK at $APK — run: bun run build:android" >&2
  exit 1
fi

# Optional: SLATE_ADB_HOST=192.168.1.5 SLATE_ADB_PORT=37xxx
if [[ -n "${SLATE_ADB_HOST:-}" && -n "${SLATE_ADB_PORT:-}" ]]; then
  "$ADB" connect "${SLATE_ADB_HOST}:${SLATE_ADB_PORT}" >/dev/null 2>&1 || true
fi

for _ in 1 2 3 4 5; do
  mapfile -t devices < <("$ADB" devices | awk 'NR > 1 && $2 == "device" { print $1 }')
  if ((${#devices[@]} > 0)); then
    break
  fi
  "$ADB" reconnect >/dev/null 2>&1 || true
  sleep 2
done

if ((${#devices[@]} == 0)); then
  echo "No device connected. APK is ready at $APK" >&2
  echo "" >&2
  echo "Wi-Fi reconnect:" >&2
  echo "  1. Phone → Wireless debugging ON" >&2
  echo "  2. Note IP address & port on that screen" >&2
  echo "  3. SLATE_ADB_HOST=192.168.1.5 SLATE_ADB_PORT=<port> bun run install:android" >&2
  exit 1
fi

if ((${#devices[@]} > 1)); then
  export ANDROID_SERIAL="${devices[0]}"
  echo "Multiple devices; using ${devices[0]}"
fi

echo "Installing $APK on ${ANDROID_SERIAL:-${devices[0]}}..."
"$ADB" install -r "$APK"
echo "Done. Slate is installed."