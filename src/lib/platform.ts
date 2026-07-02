import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

let runtimePlatform: string | null = null;
let platformReady: Promise<void> | null = null;

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isMobileUserAgent() {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes("android") || ua.includes("iphone") || ua.includes("ipad");
}

export function initRuntimePlatform(): Promise<void> {
  if (!isTauriRuntime()) {
    runtimePlatform = "web";
    return Promise.resolve();
  }

  if (!platformReady) {
    platformReady = invoke<string>("runtime_platform")
      .then((platform) => {
        runtimePlatform = platform;
      })
      .catch(() => {
        runtimePlatform = isMobileUserAgent() ? "android" : "desktop";
      });
  }

  return platformReady;
}

export async function isMobileRuntime(): Promise<boolean> {
  await initRuntimePlatform();
  if (runtimePlatform === "android" || runtimePlatform === "ios") {
    return true;
  }
  return isTauriRuntime() && isMobileUserAgent();
}

export function isMobileApp(): boolean {
  if (runtimePlatform === "android" || runtimePlatform === "ios") {
    return true;
  }
  return isTauriRuntime() && isMobileUserAgent();
}

/** Linux/macOS/Windows Tauri shell — not Android/iOS WebView. */
export function useDesktopShell() {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    initRuntimePlatform()
      .then(() => {
        setDesktop(isTauriRuntime() && !isMobileApp());
      })
      .catch(() => {
        setDesktop(isTauriRuntime() && !isMobileUserAgent());
      });
  }, []);

  return desktop;
}
