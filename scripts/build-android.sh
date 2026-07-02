#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.cargo/bin:$PATH"
export RUSTUP_TOOLCHAIN="${RUSTUP_TOOLCHAIN:-stable}"

if [[ -z "${ANDROID_HOME:-}" ]]; then
  for candidate in "$HOME/Android/Sdk" "$HOME/Android/sdk"; do
    if [[ -d "$candidate" ]]; then
      export ANDROID_HOME="$candidate"
      break
    fi
  done
fi

if [[ -n "${ANDROID_HOME:-}" ]]; then
  NDK_DIR="$(find "$ANDROID_HOME/ndk" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1)"
  if [[ -n "$NDK_DIR" ]]; then
    export NDK_HOME="$NDK_DIR"
    export PATH="$NDK_DIR/toolchains/llvm/prebuilt/linux-x86_64/bin:$PATH"
  fi
fi

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local (DATABASE_URL + DATABASE_TOKEN)" >&2
  exit 1
fi

echo "Refreshing Android launcher icons..."
bash "$ROOT/scripts/regenerate-icons.sh"

echo "Configuring Android APK signing..."
bash "$ROOT/scripts/setup-android-signing.sh"

echo "Building signed Android APK..."
if [[ -f "${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/slate.key}" ]]; then
  export TAURI_SIGNING_PRIVATE_KEY_PATH="${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/slate.key}"
fi

bun run tauri android build
bun run export:apk

echo "APK exported to $ROOT/slate-android.apk"
echo "Install with: adb install -r slate-android.apk"