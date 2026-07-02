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
import { motion } from "motion/react";
import { useState } from "react";
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
          : await api.register(
              email.trim(),
              password,
              displayName.trim() || "You"
            );
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
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <Logo size="sm" title="Slate" />
            <h1 className="font-semibold text-xl tracking-tight">Slate</h1>
          </div>
          <p className="mt-1.5 text-text-muted text-xs leading-relaxed">
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
                className={clsx(
                  "focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 font-medium text-xs transition",
                  mode === key
                    ? "bg-surface-3 text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                )}
                key={key}
                onClick={() => setMode(key)}
                type="button"
              >
                <Icon size={14} weight={mode === key ? "fill" : "regular"} />
                {label}
              </button>
            ))}
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            {mode === "register" ? (
              <label className="block space-y-1">
                <span className="text-text-muted text-xs">Display name</span>
                <div className="relative">
                  <User
                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
                    size={15}
                  />
                  <input
                    className={fieldClass}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Nithish"
                    value={displayName}
                  />
                </div>
              </label>
            ) : null}

            <label className="block space-y-1">
              <span className="text-text-muted text-xs">Email</span>
              <div className="relative">
                <EnvelopeSimple
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
                  size={15}
                />
                <input
                  className={fieldClass}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
            </label>

            <label className="block space-y-1">
              <span className="text-text-muted text-xs">Password</span>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
                  size={15}
                />
                <input
                  className={fieldClass}
                  minLength={8}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                  type="password"
                  value={password}
                />
              </div>
            </label>

            {error ? (
              <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-2.5 py-2 text-danger text-xs">
                <WarningCircle
                  className="mt-0.5 shrink-0"
                  size={14}
                  weight="fill"
                />
                <span>{error}</span>
              </p>
            ) : null}

            <button
              className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 font-medium text-sm text-surface-0 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading && <CircleNotch className="animate-spin" size={16} />}
              {!loading && mode === "login" && (
                <SignIn size={16} weight="bold" />
              )}
              {!loading && mode === "register" && (
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
