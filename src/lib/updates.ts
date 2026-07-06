import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  initRuntimePlatform,
  isMobileRuntime,
  isTauriRuntime,
} from "./platform";

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

export type DesktopInstallKind = "bare-linux" | "bundled-linux" | "bundled";

export interface PendingUpdate {
  androidDownloadUrl?: string;
  bareLinuxDownloadUrl?: string;
  bareLinuxSignature?: string;
  desktop?: Update;
  notes?: string;
  version: string;
}

export interface MobileUpdateResponse {
  androidDownloadUrl?: string;
  availableVersion?: string;
  currentVersion: string;
  message: string;
  notes?: string;
  phase: UpdatePhase;
}

export interface DesktopUpdateResponse {
  availableVersion?: string;
  bareLinuxDownloadUrl?: string;
  bareLinuxSignature?: string;
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

  if ((await readDesktopInstallKind()) === "bare-linux") {
    return checkForBareLinuxUpdate(currentVersion);
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

  if (update.bareLinuxDownloadUrl && update.bareLinuxSignature) {
    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listen<number | null>(
        "bare-linux-update-progress",
        (event) => {
          onProgress(event.payload ?? undefined);
        }
      );
      onProgress(0);
      await invoke("install_bare_linux_update", {
        url: update.bareLinuxDownloadUrl,
        signature: update.bareLinuxSignature,
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
    } finally {
      unlisten?.();
    }
  }

  if (update.androidDownloadUrl) {
    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listen<{ percent?: number }>(
        "android-update-progress",
        (event) => {
          onProgress(event.payload.percent);
        }
      );
      onProgress(0);
      await invoke("install_android_update", {
        url: update.androidDownloadUrl,
      });
      return {
        phase: "available",
        currentVersion,
        availableVersion: update.version,
        message:
          "Update downloaded. Tap Install on the system prompt, then reopen Slate.",
      };
    } catch (err) {
      return {
        phase: "error",
        currentVersion,
        availableVersion: update.version,
        message: formatUpdateError(err),
      };
    } finally {
      unlisten?.();
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

export async function readDesktopInstallKind(): Promise<DesktopInstallKind | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  await initRuntimePlatform();
  try {
    return await invoke<DesktopInstallKind>("desktop_install_kind");
  } catch {
    return "bundled";
  }
}

export function mapDesktopUpdateResponse(
  fallbackCurrentVersion: string,
  result: DesktopUpdateResponse
): { state: UpdateState; pending?: PendingUpdate } {
  const state: UpdateState = {
    phase: result.phase,
    currentVersion: result.currentVersion || fallbackCurrentVersion,
    availableVersion: result.availableVersion,
    notes: result.notes,
    message: result.message,
  };

  if (result.phase !== "available" || !result.availableVersion) {
    return { state };
  }

  const hasBareLinuxAsset = Boolean(
    result.bareLinuxDownloadUrl && result.bareLinuxSignature
  );

  return {
    state,
    pending: hasBareLinuxAsset
      ? {
          version: result.availableVersion,
          notes: result.notes,
          bareLinuxDownloadUrl: result.bareLinuxDownloadUrl,
          bareLinuxSignature: result.bareLinuxSignature,
        }
      : undefined,
  };
}

export function mapMobileUpdateResponse(
  fallbackCurrentVersion: string,
  result: MobileUpdateResponse
): { state: UpdateState; pending?: PendingUpdate } {
  const state: UpdateState = {
    phase: result.phase,
    currentVersion: result.currentVersion || fallbackCurrentVersion,
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
}

export function shouldClearPendingAfterAndroidInstall(
  result: UpdateState,
  hadAndroidDownloadUrl: boolean
): boolean {
  return hadAndroidDownloadUrl && result.phase !== "error";
}

async function checkForBareLinuxUpdate(
  currentVersion: string
): Promise<{ state: UpdateState; pending?: PendingUpdate }> {
  try {
    const result = await invoke<DesktopUpdateResponse>(
      "check_bare_linux_update",
      {
        currentVersion,
      }
    );
    return mapDesktopUpdateResponse(currentVersion, result);
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

async function checkForMobileUpdate(
  currentVersion: string
): Promise<{ state: UpdateState; pending?: PendingUpdate }> {
  try {
    const result = await invoke<MobileUpdateResponse>("check_mobile_update", {
      currentVersion,
    });
    return mapMobileUpdateResponse(currentVersion, result);
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

export function formatUpdateError(err: unknown): string {
  const raw = String(err);
  if (raw.includes("404") || raw.toLowerCase().includes("not found")) {
    return "No release found yet. Publish a GitHub release first.";
  }
  if (
    raw.toLowerCase().includes("appimage") &&
    raw.toLowerCase().includes("bare binary")
  ) {
    return "This install uses a bare Linux binary, but the release only published an AppImage. Reinstall from the repo with `bun run install:reuse`, or wait for the next release with a bare-binary update.";
  }
  if (
    raw.toLowerCase().includes("permission denied") ||
    raw.includes("os error 13")
  ) {
    return "Can't update the install folder (often /opt/slate, which is root-owned). Quit Slate, run `bun run install:reuse` from the repo to install under ~/.local/share/slate, then try again.";
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
