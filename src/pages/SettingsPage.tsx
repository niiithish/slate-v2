import { useEffect, useState } from "react";
import { Bell, SignOut } from "@phosphor-icons/react";
import { useConfirm } from "../components/ConfirmDialog";
import * as api from "../lib/api";
import { clearSession } from "../lib/auth";
import type { User } from "../lib/types";

interface SettingsPageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function SettingsPage({ token, user, onLogout }: SettingsPageProps) {
  const [health, setHealth] = useState<string>("checking");
  const [reminders, setReminders] = useState<string[]>([]);
  const { confirm, dialog: confirmDialog } = useConfirm();

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