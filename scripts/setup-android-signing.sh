#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROPS_FILE="$ROOT/src-tauri/gen/android/keystore.properties"

if [[ -f "$PROPS_FILE" ]]; then
  echo "Android signing already configured at $PROPS_FILE"
  exit 0
fi

if [[ -n "${ANDROID_KEYSTORE_BASE64:-}" ]]; then
  KEYSTORE_PATH="${ANDROID_KEYSTORE_PATH:-${RUNNER_TEMP:-/tmp}/android.keystore}"
  mkdir -p "$(dirname "$KEYSTORE_PATH")"
  echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$KEYSTORE_PATH"
  cat > "$PROPS_FILE" <<EOF
password=${ANDROID_KEY_PASSWORD}
keyAlias=${ANDROID_KEY_ALIAS}
storeFile=${KEYSTORE_PATH}
EOF
  echo "Configured CI Android signing from secret keystore."
  exit 0
fi

KEYSTORE="${SLATE_ANDROID_KEYSTORE:-$HOME/.tauri/slate-android.jks}"
STORE_PASS="${SLATE_ANDROID_STORE_PASS:-slate-dev}"
KEY_ALIAS="${SLATE_ANDROID_KEY_ALIAS:-slate}"
KEY_PASS="${SLATE_ANDROID_KEY_PASS:-slate-dev}"

mkdir -p "$(dirname "$KEYSTORE")"

if [[ ! -f "$KEYSTORE" ]]; then
  echo "Creating local Android debug keystore at $KEYSTORE"
  keytool -genkey -v \
    -keystore "$KEYSTORE" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass "$STORE_PASS" \
    -keypass "$KEY_PASS" \
    -dname "CN=Slate Dev, OU=Dev, O=Slate, L=Local, ST=Local, C=US"
fi

cat > "$PROPS_FILE" <<EOF
password=${STORE_PASS}
keyAlias=${KEY_ALIAS}
storeFile=${KEYSTORE}
EOF

echo "Android signing configured with $KEYSTORE"