import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  installUpdate,
  type MobileUpdateResponse,
  mapMobileUpdateResponse,
  type PendingUpdate,
  shouldClearPendingAfterAndroidInstall,
} from "./updates";

const openUrlMock = mock(() => Promise.resolve());
const getVersionMock = mock(() => Promise.resolve("0.1.0"));

mock.module("@tauri-apps/api/app", () => ({
  getVersion: getVersionMock,
}));

mock.module("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}));

mock.module("./platform", () => ({
  isMobileRuntime: async () => true,
  isTauriRuntime: () => true,
}));

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
    openUrlMock.mockClear();
    getVersionMock.mockClear();
  });

  afterEach(() => {
    openUrlMock.mockReset();
    getVersionMock.mockReset();
  });

  test("opens APK URL and returns sideload status message", async () => {
    const pending: PendingUpdate = {
      version: "0.2.0",
      androidDownloadUrl:
        "https://github.com/niiithish/slate-v2/releases/download/v0.2.0/slate-android.apk",
    };

    const progressCalls: Array<number | undefined> = [];
    const result = await installUpdate(pending, (progress) => {
      progressCalls.push(progress);
    });

    expect(openUrlMock).toHaveBeenCalledTimes(1);
    expect(openUrlMock).toHaveBeenCalledWith(pending.androidDownloadUrl);
    expect(progressCalls).toEqual([undefined]);
    expect(result.phase).toBe("available");
    expect(result.message).toContain("Download started");
    expect(result.availableVersion).toBe("0.2.0");
  });
});

describe("shouldClearPendingAfterAndroidInstall", () => {
  test("clears pending after successful android openUrl handoff", () => {
    expect(
      shouldClearPendingAfterAndroidInstall(
        {
          phase: "available",
          currentVersion: "0.1.0",
          availableVersion: "0.2.0",
          message: "Download started.",
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
