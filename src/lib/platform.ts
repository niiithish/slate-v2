import { useEffect, useState } from "react";

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isMobileUserAgent() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes("android") || ua.includes("iphone") || ua.includes("ipad");
}

/** Linux/macOS/Windows Tauri shell — not Android/iOS WebView. */
export function useDesktopShell() {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    setDesktop(isTauriRuntime() && !isMobileUserAgent());
  }, []);

  return desktop;
}