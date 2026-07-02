import { useEffect, useState } from "react";
import { ArrowsClockwise, Bell, DownloadSimple, Power, SignOut } from "@phosphor-icons/react";
import type { Update } from "@tauri-apps/plugin-updater";
import { useConfirm } from "../components/ConfirmDialog";
import * as api from "../lib/api";
import { getAutostartEnabled, setAutostartEnabled } from "../lib/autostart";
import { clearSession } from "../lib/auth";
import { useDesktopShell } from "../lib/platform";
import {
  checkForUpdate,
  installUpdate,
  readAppVersion,
  updatesSupported,
  type UpdateState,
} from "../lib/updates";
import type { User } from "../lib/types";

interface SettingsPageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function SettingsPage({ token, user, onLogout }: SettingsPageProps) {
  const desktop = useDesktopShell();
  const [health, setHealth] = useState<string>("checking");
  const [reminders, setReminders] = useState<string[]>([]);
  const [autostart, setAutostart] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(desktop);
  const [appVersion, setAppVersion] = useState("…");
  const [updateState, setUpdateState] = useState<UpdateState>({
    phase: "idle",
    currentVersion: "…",
  });
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const canUpdate = updatesSupported();

  useEffect(() => {
    if (!desktop) return;
    getAutostartEnabled()
      .then(setAutostart)
      .catch(() => setAutostart(false))
      .finally(() => setAutostartLoading(false));
  }, [desktop]);

  useEffect(() => {
    if (!canUpdate) return;
    readAppVersion().then((version) => {
      setAppVersion(version);
      setUpdateState((prev) => ({ ...prev, currentVersion: version }));
    });
  }, [canUpdate]);

  useEffect(() => {
    api
      .healthCheck()
      .then((result) => {
        setHealth(result.database ? "Turso connected" : "Database unavailable");
      })
      .catch(() => setHealth("Health check failed"));
    api
      .getReminderSchedule(token)
      .then((items) => setReminders(items.map((item) => `${item.title} at ${item.fire_at}`)))
      .catch(() => setReminders([]));
  }, [token]);

  async function handleCheckUpdate() {
    setUpdateBusy(true);
    setUpdateState((prev) => ({ ...prev, phase: "checking", message: undefined }));
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
    if (!pendingUpdate) return;
    setUpdateBusy(true);
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
          phase: "downloading",
          progress,
          message:
            progress === undefined
              ? "Downloading update…"
              : `Downloading… ${progress}%`,
        }));
      });
      setUpdateState(result);
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
    <div className="space-y-6 px-5 py-6 pb-28">
      <header>
        <p className="text-sm text-text-muted">Settings</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">Account</h2>
      </header>

      <section className="glass-panel rounded-2xl p-5">
        <p className="text-sm text-text-muted">Signed in as</p>
        <p className="mt-1 text-lg font-medium">{user.display_name}</p>
        <p className="text-sm text-text-secondary">{user.email}</p>
        <p className="mt-4 text-xs text-text-muted">{health}</p>
      </section>

      {canUpdate ? (
        <section className="glass-panel rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <ArrowsClockwise size={18} className="text-accent" />
            App updates
          </div>
          <p className="text-sm text-text-secondary">
            Installed version <span className="font-medium text-text-primary">{appVersion}</span>
          </p>
          <p className="mt-2 text-xs text-text-muted">
            Checks GitHub releases when you tap the button below.
          </p>

          {updateState.message ? (
            <p
              className={`mt-3 text-sm ${
                updateState.phase === "error" ? "text-red-400" : "text-text-secondary"
              }`}
            >
              {updateState.message}
            </p>
          ) : null}

          {updateState.notes ? (
            <p className="mt-2 text-xs leading-relaxed text-text-muted">{updateState.notes}</p>
          ) : null}

          {updateState.phase === "downloading" && updateState.progress !== undefined ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${updateState.progress}%` }}
              />
            </div>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={updateBusy}
              onClick={handleCheckUpdate}
              className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 py-2.5 text-sm font-medium transition hover:bg-surface-3 active:scale-[0.98] disabled:opacity-50"
            >
              <ArrowsClockwise size={16} className={updateBusy ? "animate-spin" : ""} />
              {updateState.phase === "checking" ? "Checking…" : "Check for updates"}
            </button>

            {pendingUpdate ? (
              <button
                type="button"
                disabled={updateBusy}
                onClick={handleInstallUpdate}
                className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                <DownloadSimple size={16} weight="bold" />
                Install v{pendingUpdate.version}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {desktop ? (
        <section className="glass-panel rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Power size={18} className="text-accent" />
            Desktop
          </div>
          <label className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Start on boot</p>
              <p className="mt-1 text-xs text-text-muted">
                Launch Slate in the background when you log in.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autostart}
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
              className={`focus-ring relative h-7 w-12 shrink-0 rounded-full transition ${
                autostart ? "bg-accent" : "bg-surface-3"
              } ${autostartLoading ? "opacity-60" : ""}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                  autostart ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>
          <p className="mt-4 text-xs leading-relaxed text-text-muted">
            Closing the window keeps Slate running in the system tray so reminders still fire.
            Right-click the tray icon to quit completely.
          </p>
        </section>
      ) : null}

      <section className="glass-panel rounded-2xl p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Bell size={18} className="text-accent" />
          Upcoming reminders
        </div>
        {reminders.length === 0 ? (
          <p className="text-sm text-text-muted">No scheduled reminders yet.</p>
        ) : (
          <ul className="space-y-2 text-sm text-text-secondary">
            {reminders.map((item) => (
              <li key={item} className="rounded-xl bg-surface-2 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={handleLogout}
        className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text-primary transition hover:bg-surface-3 active:scale-[0.98]"
      >
        <SignOut size={18} />
        Sign out
      </button>
      {confirmDialog}
    </div>
  );
}