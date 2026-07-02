import { useDesktopShell } from "../lib/platform";

/** Opaque strip under the Android status bar so scroll content never shows through. */
export function MobileChrome() {
  const desktop = useDesktopShell();

  if (desktop) {
    return null;
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 bg-surface-0"
        style={{ height: "var(--safe-top)" }}
      />
      <div
        aria-hidden="true"
        className="shrink-0 bg-surface-0"
        style={{ height: "var(--safe-top)" }}
      />
    </>
  );
}
