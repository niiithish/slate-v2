import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { isMobileUserAgent, isTauriRuntime } from "./platform";

const ERROR_PREFIX_RE = /^Error:\s*/i;
const VERSION_PREFIX_RE = /^v/i;
const LATEST_JSON_URL =
  "https://github.com/niiithish/slate-v2/releases/latest/download/latest.json";
const GITHUB_REPO = "niiithish/slate-v2";
const ANDROID_APK_NAMES = ["slate-android.apk", "app-universal-release.apk"];
const ANDROID_PLATFORM_KEYS = [
  "android-aarch64",
  "android-armv7",
  "android-universal",
];

export type UpdatePhase =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "installing"
  | "error";

export interface UpdateState {
  availableVersion?: string;
  currentVersion: string;
  message?: string;
  notes?: string;
  phase: UpdatePhase;
  progress?: number;
}

export interface PendingUpdate {
  androidDownloadUrl?: string;
  desktop?: Update;
  notes?: string;
  version: string;
}

interface LatestManifest {
  notes?: string;
  platforms?: Record<string, { url?: string }>;
  version: string;
}

export function isMobileApp(): boolean {
  return isTauriRuntime() && isMobileUserAgent();
}

export async function readAppVersion(): Promise<string> {
  if (!isTauriRuntime()) {
    return "web";
  }
  return await getVersion();
}

export function updatesSupported(): boolean {
  return isTauriRuntime();
}

export async function checkForUpdate(): Promise<{
  state: UpdateState;
  pending?: PendingUpdate;
}> {
  const currentVersion = await readAppVersion();

  if (isMobileApp()) {
    return checkForMobileUpdate(currentVersion);
  }

  try {
    const update = await check();
    if (!update) {
      return {
        state: {
          phase: "current",
          currentVersion,
          message: "You're on the latest version.",
        },
      };
    }

    return {
      state: {
        phase: "available",
        currentVersion,
        availableVersion: update.version,
        notes: update.body ?? undefined,
        message: `Version ${update.version} is available.`,
      },
      pending: {
        version: update.version,
        notes: update.body ?? undefined,
        desktop: update,
      },
    };
  } catch (err) {
    return {
      state: {
        phase: "error",
        currentVersion,
        message: formatUpdateError(err),
      },
    };
  }
}

export async function installUpdate(
  update: PendingUpdate,
  onProgress: (progress: number | undefined) => void
): Promise<UpdateState> {
  const currentVersion = await readAppVersion();

  if (update.androidDownloadUrl) {
    try {
      onProgress(undefined);
      await openUrl(update.androidDownloadUrl);
      return {
        phase: "available",
        currentVersion,
        availableVersion: update.version,
        message:
          "Download started. Open the APK from your notifications when it finishes, then allow installs from this source if prompted.",
      };
    } catch (err) {
      return {
        phase: "error",
        currentVersion,
        availableVersion: update.version,
        message: formatUpdateError(err),
      };
    }
  }

  const desktopUpdate = update.desktop;
  if (!desktopUpdate) {
    return {
      phase: "error",
      currentVersion,
      availableVersion: update.version,
      message: "No install package found for this device.",
    };
  }

  let downloaded = 0;
  let contentLength: number | undefined;

  try {
    await desktopUpdate.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          contentLength = event.data.contentLength ?? undefined;
          onProgress(contentLength ? 0 : undefined);
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          onProgress(
            contentLength && contentLength > 0
              ? Math.min(100, Math.round((downloaded / contentLength) * 100))
              : undefined
          );
          break;
        case "Finished":
          onProgress(100);
          break;
        default:
          break;
      }
    });

    await relaunch();
    return {
      phase: "installing",
      currentVersion,
      availableVersion: update.version,
      message: "Restarting…",
    };
  } catch (err) {
    return {
      phase: "error",
      currentVersion,
      availableVersion: update.version,
      message: formatUpdateError(err),
    };
  }
}

async function checkForMobileUpdate(
  currentVersion: string
): Promise<{ state: UpdateState; pending?: PendingUpdate }> {
  try {
    const response = await fetch(LATEST_JSON_URL);
    if (!response.ok) {
      throw new Error(`Release check failed (${response.status})`);
    }

    const manifest = (await response.json()) as LatestManifest;
    const latestVersion = normalizeVersion(manifest.version);

    if (!isNewerVersion(latestVersion, currentVersion)) {
      return {
        state: {
          phase: "current",
          currentVersion,
          message: "You're on the latest version.",
        },
      };
    }

    const androidDownloadUrl = await resolveAndroidApkUrl(
      manifest,
      latestVersion
    );
    const notes = manifest.notes?.trim() || undefined;

    return {
      state: {
        phase: "available",
        currentVersion,
        availableVersion: latestVersion,
        notes,
        message: androidDownloadUrl
          ? `Version ${latestVersion} is available.`
          : `Version ${latestVersion} is available, but no APK is attached to the release yet.`,
      },
      pending: {
        version: latestVersion,
        notes,
        androidDownloadUrl,
      },
    };
  } catch (err) {
    return {
      state: {
        phase: "error",
        currentVersion,
        message: formatUpdateError(err),
      },
    };
  }
}

async function resolveAndroidApkUrl(
  manifest: LatestManifest,
  version: string
): Promise<string | undefined> {
  for (const key of ANDROID_PLATFORM_KEYS) {
    const url = manifest.platforms?.[key]?.url;
    if (url) {
      return url;
    }
  }

  const tag = version.startsWith("v") ? version : `v${version}`;
  for (const name of ANDROID_APK_NAMES) {
    const url = `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${name}`;
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok) {
        return url;
      }
    } catch {
      // Try the next candidate URL.
    }
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (!response.ok) {
      return;
    }

    const release = (await response.json()) as {
      assets?: Array<{ browser_download_url?: string; name?: string }>;
    };

    for (const asset of release.assets ?? []) {
      if (asset.name?.endsWith(".apk") && asset.browser_download_url) {
        return asset.browser_download_url;
      }
    }
  } catch {
    return;
  }

  return;
}

function normalizeVersion(version: string): string {
  return version.replace(VERSION_PREFIX_RE, "");
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = normalizeVersion(latest).split(".").map(Number);
  const currentParts = normalizeVersion(current).split(".").map(Number);
  const length = Math.max(latestParts.length, currentParts.length);

  for (let index = 0; index < length; index += 1) {
    const next = latestParts[index] ?? 0;
    const prev = currentParts[index] ?? 0;
    if (next !== prev) {
      return next > prev;
    }
  }

  return false;
}

function formatUpdateError(err: unknown): string {
  const raw = String(err);
  if (raw.includes("Unsupported OS")) {
    return "In-app updates are not available on this device yet.";
  }
  if (raw.includes("404") || raw.toLowerCase().includes("not found")) {
    return "No release found yet. Publish a GitHub release first.";
  }
  if (
    raw.toLowerCase().includes("network") ||
    raw.toLowerCase().includes("fetch")
  ) {
    return "Couldn't reach GitHub. Check your connection and try again.";
  }
  return raw.replace(ERROR_PREFIX_RE, "");
}
