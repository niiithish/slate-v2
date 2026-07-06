#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
TAG="v${VERSION}"
BINARY_SRC="$ROOT/src-tauri/target/release/slate"
BARE_ASSET="slate-linux-x86_64"
PLATFORM_KEY="linux-x86_64-bare"

if [[ ! -f "$BINARY_SRC" ]]; then
  echo "Missing release binary: $BINARY_SRC" >&2
  exit 1
fi

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -z "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]]; then
  echo "Set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH before publishing." >&2
  exit 1
fi

cd "$ROOT"
cp "$BINARY_SRC" "$BARE_ASSET"
bun run tauri signer sign "$BARE_ASSET"

SIGNATURE="$(tr -d '\n' < "${BARE_ASSET}.sig")"
DOWNLOAD_URL="https://github.com/niiithish/slate-v2/releases/download/${TAG}/${BARE_ASSET}"

gh release download "$TAG" latest.json --dir /tmp
LATEST_JSON="/tmp/latest.json"

jq \
  --arg key "$PLATFORM_KEY" \
  --arg url "$DOWNLOAD_URL" \
  --arg signature "$SIGNATURE" \
  '.platforms[$key] = {url: $url, signature: $signature}' \
  "$LATEST_JSON" > "${LATEST_JSON}.next"
mv "${LATEST_JSON}.next" "$LATEST_JSON"

gh release upload "$TAG" "$BARE_ASSET" "${BARE_ASSET}.sig" "$LATEST_JSON" --clobber

echo "Published ${BARE_ASSET} and patched latest.json (${PLATFORM_KEY})."