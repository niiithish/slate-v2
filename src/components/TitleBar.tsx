import { Minus, X } from "@phosphor-icons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar() {
  async function minimize() {
    await getCurrentWindow().minimize();
  }

  async function close() {
    await getCurrentWindow().close();
  }

  return (
    <header
      data-tauri-drag-region
      className="flex h-8 shrink-0 items-center justify-end gap-0.5 bg-surface-0 px-1.5 select-none"
    >
      <button
        type="button"
        onClick={minimize}
        aria-label="Minimize"
        className="focus-ring flex h-6 w-7 items-center justify-center rounded text-text-muted transition hover:bg-surface-2 hover:text-text-primary active:scale-95"
      >
        <Minus size={11} weight="bold" />
      </button>
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="focus-ring flex h-6 w-7 items-center justify-center rounded text-text-muted transition hover:bg-danger-soft hover:text-danger active:scale-95"
      >
        <X size={11} weight="bold" />
      </button>
    </header>
  );
}