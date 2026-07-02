import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { isTauriRuntime } from "./platform";

export async function getAutostartEnabled(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }
  return await isEnabled();
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  if (enabled) {
    await enable();
  } else {
    await disable();
  }
}
