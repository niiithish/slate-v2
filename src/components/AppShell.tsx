import { useDesktopShell } from "../lib/platform";
import { TitleBar } from "./TitleBar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const desktop = useDesktopShell();

  return (
    <div className="mx-auto flex min-h-dvh w-full flex-col overflow-x-hidden bg-surface-0">
      {desktop ? <TitleBar /> : null}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
