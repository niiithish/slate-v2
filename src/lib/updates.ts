import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { isMobileRuntime, isTauriRuntime } from "./platform";

const ERROR_PREFIX_RE = /^Error:\s*/i;

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

interface MobileUpdateResponse {
  androidDownloadUrl?: string;
  availableVersion?: string;
  currentVersion: string;
  message: string;
  notes?: string;
  phase: UpdatePhase;
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

  if (await isMobileRuntime()) {
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
    const result = await invoke<MobileUpdateResponse>("check_mobile_update", {
      currentVersion,
    });

    const state: UpdateState = {
      phase: result.phase,
      currentVersion: result.currentVersion,
      availableVersion: result.availableVersion,
      notes: result.notes,
      message: result.message,
    };

    if (result.phase !== "available" || !result.availableVersion) {
      return { state };
    }

    return {
      state,
      pending: {
        version: result.availableVersion,
        notes: result.notes,
        androidDownloadUrl: result.androidDownloadUrl,
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

function formatUpdateError(err: unknown): string {
  const raw = String(err);
  if (raw.includes("404") || raw.toLowerCase().includes("not found")) {
    return "No release found yet. Publish a GitHub release first.";
  }
  if (
    raw.toLowerCase().includes("network") ||
    raw.toLowerCase().includes("fetch") ||
    raw.toLowerCase().includes("github request failed")
  ) {
    return "Couldn't reach GitHub. Check your connection and try again.";
  }
  return raw.replace(ERROR_PREFIX_RE, "");
}
