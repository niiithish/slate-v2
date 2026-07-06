import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  type DesktopUpdateResponse,
  formatUpdateError,
  installUpdate,
  type MobileUpdateResponse,
  mapDesktopUpdateResponse,
  mapMobileUpdateResponse,
  type PendingUpdate,
  shouldClearPendingAfterAndroidInstall,
} from "./updates";

const installAndroidUpdateMock = mock(() => Promise.resolve());
const listenMock = mock(() => Promise.resolve(() => undefined));
const getVersionMock = mock(() => Promise.resolve("0.1.0"));

mock.module("@tauri-apps/api/app", () => ({
  getVersion: getVersionMock,
}));

mock.module("@tauri-apps/api/core", () => ({
  invoke: installAndroidUpdateMock,
}));

mock.module("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

mock.module("./platform", () => ({
  isMobileRuntime: async () => true,
  isTauriRuntime: () => true,
}));

describe("mapDesktopUpdateResponse", () => {
  test("returns pending bare-linux update when asset is attached", () => {
    const invokeResponse: DesktopUpdateResponse = {
      phase: "available",
      currentVersion: "0.1.0",
      availableVersion: "0.2.0",
      bareLinuxDownloadUrl:
        "https://github.com/niiithish/slate-v2/releases/download/v0.2.0/slate-linux-x86_64",
      bareLinuxSignature: "dGVzdA==",
      message: "Version 0.2.0 is available.",
      notes: "Bug fixes",
    };

    const mapped = mapDesktopUpdateResponse("0.1.0", invokeResponse);

    expect(mapped.state.phase).toBe("available");
    expect(mapped.pending?.bareLinuxDownloadUrl).toContain(
      "slate-linux-x86_64"
    );
    expect(mapped.pending?.bareLinuxSignature).toBe("dGVzdA==");
  });

  test("returns no pending update when bare-linux asset is missing", () => {
    const invokeResponse: DesktopUpdateResponse = {
      phase: "available",
      currentVersion: "0.1.0",
      availableVersion: "0.2.0",
      message:
        "Version 0.2.0 is published, but the bare Linux binary is not attached yet.",
    };

    const mapped = mapDesktopUpdateResponse("0.1.0", invokeResponse);

    expect(mapped.state.phase).toBe("available");
    expect(mapped.pending).toBeUndefined();
  });
});

describe("mapMobileUpdateResponse", () => {
  test("returns pending update with androidDownloadUrl from invoke response", () => {
    const invokeResponse: MobileUpdateResponse = {
      phase: "available",
      currentVersion: "0.1.0",
      availableVersion: "0.2.0",
      androidDownloadUrl:
        "https://github.com/niiithish/slate-v2/releases/download/v0.2.0/slate-android.apk",
      message: "Version 0.2.0 is available.",
      notes: "Bug fixes",
    };

    const mapped = mapMobileUpdateResponse("0.1.0", invokeResponse);

    expect(mapped.state.phase).toBe("available");
    expect(mapped.state.availableVersion).toBe("0.2.0");
    expect(mapped.pending?.version).toBe("0.2.0");
    expect(mapped.pending?.androidDownloadUrl).toBe(
      "https://github.com/niiithish/slate-v2/releases/download/v0.2.0/slate-android.apk"
    );
  });

  test("returns no pending update when already current", () => {
    const invokeResponse: MobileUpdateResponse = {
      phase: "current",
      currentVersion: "0.2.0",
      message: "You're on the latest version.",
    };

    const mapped = mapMobileUpdateResponse("0.2.0", invokeResponse);

    expect(mapped.state.phase).toBe("current");
    expect(mapped.pending).toBeUndefined();
  });
});

describe("installUpdate android path", () => {
  beforeEach(() => {
    installAndroidUpdateMock.mockClear();
    listenMock.mockClear();
    getVersionMock.mockClear();
  });

  afterEach(() => {
    installAndroidUpdateMock.mockReset();
    listenMock.mockReset();
    getVersionMock.mockReset();
  });

  test("downloads APK in-app and returns install prompt message", async () => {
    const pending: PendingUpdate = {
      version: "0.2.0",
      androidDownloadUrl:
        "https://github.com/niiithish/slate-v2/releases/download/v0.2.0/slate-android.apk",
    };

    const progressCalls: Array<number | undefined> = [];
    const result = await installUpdate(pending, (progress) => {
      progressCalls.push(progress);
    });

    expect(listenMock).toHaveBeenCalledTimes(1);
    expect(installAndroidUpdateMock).toHaveBeenCalledTimes(1);
    expect(installAndroidUpdateMock).toHaveBeenCalledWith(
      "install_android_update",
      { url: pending.androidDownloadUrl }
    );
    expect(progressCalls).toEqual([0]);
    expect(result.phase).toBe("available");
    expect(result.message).toContain("Update downloaded");
    expect(result.availableVersion).toBe("0.2.0");
  });
});

describe("shouldClearPendingAfterAndroidInstall", () => {
  test("clears pending after successful android install handoff", () => {
    expect(
      shouldClearPendingAfterAndroidInstall(
        {
          phase: "available",
          currentVersion: "0.1.0",
          availableVersion: "0.2.0",
          message: "Update downloaded.",
        },
        true
      )
    ).toBe(true);
  });

  test("keeps pending when android install errors", () => {
    expect(
      shouldClearPendingAfterAndroidInstall(
        {
          phase: "error",
          currentVersion: "0.1.0",
          message: "Couldn't open download.",
        },
        true
      )
    ).toBe(false);
  });

  test("maps permission denied to reinstall guidance", () => {
    const message = formatUpdateError(
      'Permission denied (os error 13) at path "/opt/slate/tauri_current_appSDBJxN"'
    );
    expect(message).toContain("install:reuse");
    expect(message).toContain(".local/share/slate");
  });

  test("does not clear pending for desktop installs", () => {
    expect(
      shouldClearPendingAfterAndroidInstall(
        {
          phase: "installing",
          currentVersion: "0.1.0",
          message: "Restarting…",
        },
        false
      )
    ).toBe(false);
  });
});
