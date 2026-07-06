# Slate

Personal routine and habit tracker — Tauri 2 + React + Turso.

## Prerequisites

- [Bun](https://bun.sh/)
- Rust toolchain
- WebKitGTK (Arch: `pacman -S webkit2gtk-4.1`)

## Setup

```bash
bun install
```

Turso credentials go in `.env.local` (`DATABASE_URL`, `DATABASE_TOKEN`).

## Development

```bash
bun run tauri dev
```

## Sync (Linux + Android)

All data lives in your **Turso cloud database**. Both apps talk to the same remote DB.

1. Build each platform with the same `.env.local` (credentials are embedded at compile time).
2. Sign in with the **same email/password** on Linux and Android.
3. Changes on one device show on the other after refresh (or reopening the app).

There is no separate sync step — Turso is the source of truth.

## Build for Arch Linux

```bash
bun run tauri build
```

Artifacts land in `src-tauri/target/release/bundle/`:

| Format | Path | Arch install |
|--------|------|--------------|
| `.deb` | `deb/Slate_0.1.0_amd64.deb` | `sudo pacman -S debtap` then `debtap --install Slate_0.1.0_amd64.deb` |
| `.rpm` | `rpm/Slate-0.1.0-1.x86_64.rpm` | `sudo pacman -S rpm-tools` then `rpm2cpio … \| cpio -idmv` (or use `yay -S slate` if you publish a PKGBUILD) |
| Binary | `../release/slate` | Run directly |

Tauri does not emit a `.tar.gz` by default. Use the `.deb` or run the binary.

### Install without rebuilding

If you built without `.env.local` present, create a config file instead:

```bash
mkdir -p ~/.config/com.nithish.slate
cp .env.local ~/.config/com.nithish.slate/.env
chmod 600 ~/.config/com.nithish.slate/.env
```

## Build Android APK

Install the SDK once:

```bash
# Arch packages
sudo pacman -S android-tools android-udev

# SDK + NDK (Android Studio or cmdline-tools)
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

sdkmanager "platform-tools" "platforms;android-36" "build-tools;35.0.0" "ndk;27.2.12479018"
```

Build the signed release APK (reads `.env.local`, refreshes icons, applies system-bar safe-area patches, configures signing):

```bash
bun run build:android
```

Quick unsigned rebuild when the Android project is already configured:

```bash
bun run build:android:fast
```

Release APK output:

```
slate-android.apk
```

**Fastest (phone plugged in or on Wi-Fi ADB):** build and install in one step:

```bash
bun run deploy:android
```

Manual install:

```bash
adb install -r slate-android.apk
```

**Over-the-air:** open Slate → Settings → Check for updates → Install. The app downloads the APK and opens Android's installer (one tap). You still need a GitHub release published first.

For day-to-day dev on your own phone, `deploy:android` skips GitHub entirely.

## Tests

```bash
bun run test:frontend
bun run test:logic
```