import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { BottomNav, type TabKey } from "./components/BottomNav";
import * as api from "./lib/api";
import { clearSession, getStoredUser, getToken } from "./lib/auth";
import { invalidateSyncedData, queryClient } from "./lib/queryClient";
import { syncReminders } from "./lib/reminders";
import type { Session, User } from "./lib/types";
import { LoginPage } from "./pages/LoginPage";
import { ManagePage } from "./pages/ManagePage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatsPage } from "./pages/StatsPage";
import { TodayPage } from "./pages/TodayPage";

function App() {
  const [tab, setTab] = useState<TabKey>("today");
  const [token, setToken] = useState<string | null>(getToken());
  const [user, setUser] = useState<User | null>(getStoredUser());

  useEffect(() => {
    if (!token) {
      queryClient.clear();
      return;
    }
    api
      .getMe(token)
      .then(setUser)
      .catch(() => {
        clearSession();
        queryClient.clear();
        setToken(null);
        setUser(null);
      });
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const refreshReminders = () => {
      syncReminders(token).catch((error) => {
        if (import.meta.env.DEV) {
          console.error("Reminder sync failed:", error);
        }
      });
    };

    refreshReminders();

    const timer = window.setInterval(refreshReminders, 15 * 60 * 1000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshReminders();
        invalidateSyncedData().catch(() => undefined);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [token]);

  if (!(token && user)) {
    return (
      <AppShell>
        <LoginPage
          onAuthenticated={(session: Session) => {
            setToken(session.token);
            setUser(session.user);
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="flex-1">
        <div className={tab === "today" ? "contents" : "hidden"}>
          <TodayPage key={token} token={token} />
        </div>
        <div className={tab === "stats" ? "contents" : "hidden"}>
          <StatsPage token={token} />
        </div>
        <div className={tab === "manage" ? "contents" : "hidden"}>
          <ManagePage token={token} />
        </div>
        <div className={tab === "settings" ? "contents" : "hidden"}>
          <SettingsPage
            onLogout={() => {
              queryClient.clear();
              setToken(null);
              setUser(null);
            }}
            token={token}
            user={user}
          />
        </div>
      </main>
      <BottomNav active={tab} onChange={setTab} />
    </AppShell>
  );
}

export default App;
