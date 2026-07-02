#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY_PATH="${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/slate.key}"

if [[ ! -f "$KEY_PATH" ]]; then
  echo "Missing signing key at $KEY_PATH"
  echo "Generate one with: bun tauri signer generate --ci -w $KEY_PATH"
  exit 1
fi

if [[ ! -f "$ROOT/.env.local" ]]; then
  echo "Missing $ROOT/.env.local (DATABASE_URL + DATABASE_TOKEN)"
  exit 1
fi

export TAURI_SIGNING_PRIVATE_KEY_PATH="$KEY_PATH"

cd "$ROOT"
bun install
bun run tauri build

echo
echo "Signed bundles are in src-tauri/target/release/bundle/"
echo "Upload them to a GitHub release and include latest.json from tauri-action,"
echo "or push a v* tag to run .github/workflows/release.yml automatically."