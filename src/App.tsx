import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { BottomNav, type TabKey } from "./components/BottomNav";
import { clearSession, getStoredUser, getToken } from "./lib/auth";
import * as api from "./lib/api";
import { LoginPage } from "./pages/LoginPage";
import { ManagePage } from "./pages/ManagePage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatsPage } from "./pages/StatsPage";
import { TodayPage } from "./pages/TodayPage";
import type { Session, User } from "./lib/types";

function App() {
  const [tab, setTab] = useState<TabKey>("today");
  const [token, setToken] = useState<string | null>(getToken());
  const [user, setUser] = useState<User | null>(getStoredUser());

  useEffect(() => {
    if (!token) return;
    api
      .getMe(token)
      .then(setUser)
      .catch(() => {
        clearSession();
        setToken(null);
        setUser(null);
      });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api.syncReminderSchedules(token).catch(() => undefined);
    const timer = window.setInterval(() => {
      api.syncReminderSchedules(token).catch(() => undefined);
    }, 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [token]);

  if (!token || !user) {
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
        {tab === "today" ? <TodayPage token={token} /> : null}
        {tab === "stats" ? <StatsPage token={token} /> : null}
        {tab === "manage" ? <ManagePage token={token} /> : null}
        {tab === "settings" ? (
          <SettingsPage
            token={token}
            user={user}
            onLogout={() => {
              setToken(null);
              setUser(null);
            }}
          />
        ) : null}
      </main>
      <BottomNav active={tab} onChange={setTab} />
    </AppShell>
  );
}

export default App;