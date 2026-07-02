import clsx from "clsx";
import { useDesktopShell } from "../lib/platform";
import { TitleBar } from "./TitleBar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const desktop = useDesktopShell();

  return (
    <div className="mx-auto flex min-h-full w-full flex-col bg-surface-0">
      {desktop ? <TitleBar /> : null}
      <div
        className={clsx(
          "flex min-h-0 flex-1 flex-col",
          !desktop &&
            "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        )}
      >
        {children}
      </div>
    </div>
  );
}
