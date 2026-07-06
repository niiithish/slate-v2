import {
  ArrowsClockwise,
  DownloadSimple,
  Power,
  SignOut,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useConfirm } from "../components/ConfirmDialog";
import { ReminderSettingsSection } from "../components/ReminderSettingsSection";
import * as api from "../lib/api";
import { clearSession } from "../lib/auth";
import { getAutostartEnabled, setAutostartEnabled } from "../lib/autostart";
import { useDesktopShell } from "../lib/platform";
import { formatHealthStatus, useHealth } from "../lib/queries";
import type { User } from "../lib/types";
import {
  checkForUpdate,
  installUpdate,
  type PendingUpdate,
  readAppVersion,
  shouldClearPendingAfterAndroidInstall,
  type UpdateState,
  updatesSupported,
} from "../lib/updates";

interface SettingsPageProps {
  onLogout: () => void;
  token: string;
  user: User;
}

function updateProgressMessage(
  progress: number | undefined,
  isAndroidDownload: boolean
): string {
  if (progress !== undefined) {
    return `Downloading… ${progress}%`;
  }
  if (isAndroidDownload) {
    return "Starting install…";
  }
  return "Downloading update…";
}

export function SettingsPage({ token, user, onLogout }: SettingsPageProps) {
  const desktop = useDesktopShell();
  const {
    data: healthResult,
    isError: healthErrored,
    isLoading: healthLoading,
  } = useHealth();
  const health = formatHealthStatus(healthLoading, healthResult, healthErrored);
  const [autostart, setAutostart] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(desktop);
  const [appVersion, setAppVersion] = useState("…");
  const [updateState, setUpdateState] = useState<UpdateState>({
    phase: "idle",
    currentVersion: "…",
  });
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(
    null
  );
  const [updateBusy, setUpdateBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const canUpdate = updatesSupported();

  useEffect(() => {
    if (!desktop) {
      return;
    }
    getAutostartEnabled()
      .then(setAutostart)
      .catch(() => setAutostart(false))
      .finally(() => setAutostartLoading(false));
  }, [desktop]);

  useEffect(() => {
    if (!canUpdate) {
      return;
    }
    readAppVersion().then((version) => {
      setAppVersion(version);
      setUpdateState((prev) => ({ ...prev, currentVersion: version }));
    });
  }, [canUpdate]);

  async function handleCheckUpdate() {
    setUpdateBusy(true);
    setUpdateState((prev) => ({
      ...prev,
      phase: "checking",
      message: undefined,
    }));
    setPendingUpdate(null);

    try {
      const result = await checkForUpdate();
      setUpdateState(result.state);
      setPendingUpdate(result.pending ?? null);
    } finally {
      setUpdateBusy(false);
    }
  }

  async function handleInstallUpdate() {
    if (!pendingUpdate) {
      return;
    }
    setUpdateBusy(true);
    const isAndroidDownload = Boolean(pendingUpdate.androidDownloadUrl);

    setUpdateState((prev) => ({
      ...prev,
      phase: "downloading",
      progress: 0,
      message: "Downloading update…",
    }));

    try {
      const result = await installUpdate(pendingUpdate, (progress) => {
        setUpdateState((prev) => ({
          ...prev,
          phase: progress === undefined ? "installing" : "downloading",
          progress,
          message: updateProgressMessage(progress, isAndroidDownload),
        }));
      });
      setUpdateState(result);
      if (shouldClearPendingAfterAndroidInstall(result, isAndroidDownload)) {
        setPendingUpdate(null);
      }
    } finally {
      setUpdateBusy(false);
    }
  }

  function handleLogout() {
    confirm({
      title: "Sign out?",
      message: "You'll need to sign in again to access your data.",
      confirmLabel: "Sign out",
      onConfirm: async () => {
        clearSession();
        onLogout();
        try {
          await api.logout(token);
        } catch {
          // Session cleared locally; server revoke is best-effort.
        }
      },
    });
  }

  return (
    <div className="space-y-6 px-5 pt-3 pb-28">
      <header>
        <p className="text-sm text-text-muted">Settings</p>
        <h2 className="mt-1 font-semibold text-2xl tracking-tight">Account</h2>
      </header>

      <section className="glass-panel rounded-2xl p-5">
        <p className="text-sm text-text-muted">Signed in as</p>
        <p className="mt-1 font-medium text-lg">{user.display_name}</p>
        <p className="text-sm text-text-secondary">{user.email}</p>
        <p className="mt-4 text-text-muted text-xs">{health}</p>
      </section>

      {canUpdate ? (
        <section className="glass-panel rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2 font-medium text-sm">
            <ArrowsClockwise className="text-accent" size={18} />
            App updates
          </div>
          <p className="text-sm text-text-secondary">
            Installed version{" "}
            <span className="font-medium text-text-primary">{appVersion}</span>
          </p>
          <p className="mt-2 text-text-muted text-xs">
            On Android, updates download in-app and open the system installer.
            On desktop, updates install automatically.
          </p>

          {updateState.message ? (
            <p
              className={`mt-3 text-sm ${
                updateState.phase === "error"
                  ? "text-red-400"
                  : "text-text-secondary"
              }`}
            >
              {updateState.message}
            </p>
          ) : null}

          {updateState.notes ? (
            <p className="mt-2 text-text-muted text-xs leading-relaxed">
              {updateState.notes}
            </p>
          ) : null}

          {updateState.phase === "downloading" &&
          updateState.progress !== undefined ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${updateState.progress}%` }}
              />
            </div>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button
              className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 py-2.5 font-medium text-sm transition hover:bg-surface-3 active:scale-[0.98] disabled:opacity-50"
              disabled={updateBusy}
              onClick={handleCheckUpdate}
              type="button"
            >
              <ArrowsClockwise
                className={updateBusy ? "animate-spin" : ""}
                size={16}
              />
              {updateState.phase === "checking"
                ? "Checking…"
                : "Check for updates"}
            </button>

            {pendingUpdate?.androidDownloadUrl || pendingUpdate?.desktop ? (
              <button
                className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-semibold text-black text-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                disabled={updateBusy}
                onClick={handleInstallUpdate}
                type="button"
              >
                <DownloadSimple size={16} weight="bold" />
                {pendingUpdate.androidDownloadUrl
                  ? `Download v${pendingUpdate.version}`
                  : `Install v${pendingUpdate.version}`}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {desktop ? (
        <section className="glass-panel rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2 font-medium text-sm">
            <Power className="text-accent" size={18} />
            Desktop
          </div>
          <label className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-sm">Start on boot</p>
              <p className="mt-1 text-text-muted text-xs">
                Launch Slate in the background when you log in.
              </p>
            </div>
            <button
              aria-checked={autostart}
              className={`focus-ring relative h-7 w-12 shrink-0 rounded-full transition ${
                autostart ? "bg-accent" : "bg-surface-3"
              } ${autostartLoading ? "opacity-60" : ""}`}
              disabled={autostartLoading}
              onClick={async () => {
                const next = !autostart;
                setAutostartLoading(true);
                try {
                  await setAutostartEnabled(next);
                  setAutostart(next);
                } catch {
                  // Keep the previous value if the OS rejects the change.
                } finally {
                  setAutostartLoading(false);
                }
              }}
              role="switch"
              type="button"
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                  autostart ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>
          <p className="mt-4 text-text-muted text-xs leading-relaxed">
            Closing the window keeps Slate running in the system tray so
            reminders still fire. Right-click the tray icon to quit completely.
          </p>
        </section>
      ) : null}

      <ReminderSettingsSection token={token} />

      <button
        className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text-primary transition hover:bg-surface-3 active:scale-[0.98]"
        onClick={handleLogout}
        type="button"
      >
        <SignOut size={18} />
        Sign out
      </button>
      {confirmDialog}
    </div>
  );
}
