#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/src-tauri/target"

if [[ ! -d "$TARGET" ]]; then
  echo "No cargo target directory yet."
  exit 0
fi

echo "Before:"
du -sh "$TARGET"/* 2>/dev/null | sort -hr | head -8 || true

removed=0
for dir in \
  "$TARGET/aarch64-linux-android" \
  "$TARGET/armv7-linux-androideabi" \
  "$TARGET/i686-linux-android" \
  "$TARGET/x86_64-linux-android" \
  "$TARGET/tmp"
do
  if [[ -d "$dir" ]]; then
    rm -rf "$dir"
    removed=1
    echo "Removed $(basename "$dir")"
  fi
done

if [[ "$removed" -eq 0 ]]; then
  echo "Nothing to clean."
else
  echo
  echo "After:"
  du -sh "$TARGET" 2>/dev/null || true
  echo "Android cross-compile artifacts cleared. Desktop target/ kept for fast rebuilds."
fi