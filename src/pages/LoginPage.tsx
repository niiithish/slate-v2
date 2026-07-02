import { useState } from "react";
import { motion } from "motion/react";
import {
  CircleNotch,
  EnvelopeSimple,
  Lock,
  SignIn,
  User,
  UserPlus,
  WarningCircle,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { Logo } from "../components/Logo";
import * as api from "../lib/api";
import { saveSession } from "../lib/auth";
import type { Session } from "../lib/types";

interface LoginPageProps {
  onAuthenticated: (session: Session) => void;
}

const fieldClass =
  "focus-ring w-full rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted";

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session =
        mode === "login"
          ? await api.login(email.trim(), password)
          : await api.register(email.trim(), password, displayName.trim() || "You");
      saveSession(session);
      onAuthenticated(session);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-5 py-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <Logo size="sm" title="Slate" />
            <h1 className="text-xl font-semibold tracking-tight">Slate</h1>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
            Track routines, avoid slipping habits, and lock in clean days.
          </p>
        </div>

        <div className="glass-panel rounded-xl p-4">
          <div className="mb-4 flex rounded-lg border border-border bg-surface-1 p-0.5">
            {(
              [
                { key: "login" as const, label: "Sign in", icon: SignIn },
                { key: "register" as const, label: "Register", icon: UserPlus },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={clsx(
                  "focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition",
                  mode === key
                    ? "bg-surface-3 text-text-primary"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
                <Icon size={14} weight={mode === key ? "fill" : "regular"} />
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "register" ? (
              <label className="block space-y-1">
                <span className="text-xs text-text-muted">Display name</span>
                <div className="relative">
                  <User
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                  />
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={fieldClass}
                    placeholder="Nithish"
                  />
                </div>
              </label>
            ) : null}

            <label className="block space-y-1">
              <span className="text-xs text-text-muted">Email</span>
              <div className="relative">
                <EnvelopeSimple
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldClass}
                  placeholder="you@example.com"
                />
              </div>
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-text-muted">Password</span>
              <div className="relative">
                <Lock
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={fieldClass}
                  placeholder="Minimum 8 characters"
                />
              </div>
            </label>

            {error ? (
              <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-2.5 py-2 text-xs text-danger">
                <WarningCircle size={14} className="mt-0.5 shrink-0" weight="fill" />
                <span>{error}</span>
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-surface-0 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? (
                <CircleNotch className="animate-spin" size={16} />
              ) : mode === "login" ? (
                <SignIn size={16} weight="bold" />
              ) : (
                <UserPlus size={16} weight="bold" />
              )}
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}