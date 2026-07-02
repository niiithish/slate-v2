import { Minus, X } from "@phosphor-icons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar() {
  async function minimize() {
    await getCurrentWindow().minimize();
  }

  async function hideToTray() {
    await getCurrentWindow().hide();
  }

  return (
    <header
      className="flex h-8 shrink-0 select-none items-center justify-end gap-0.5 bg-surface-0 px-1.5"
      data-tauri-drag-region
    >
      <button
        aria-label="Minimize"
        className="focus-ring flex h-6 w-7 items-center justify-center rounded text-text-muted transition hover:bg-surface-2 hover:text-text-primary active:scale-95"
        onClick={minimize}
        type="button"
      >
        <Minus size={11} weight="bold" />
      </button>
      <button
        aria-label="Hide to tray"
        className="focus-ring flex h-6 w-7 items-center justify-center rounded text-text-muted transition hover:bg-danger-soft hover:text-danger active:scale-95"
        onClick={hideToTray}
        type="button"
      >
        <X size={11} weight="bold" />
      </button>
    </header>
  );
}
