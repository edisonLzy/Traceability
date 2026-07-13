import { Sidebar } from "@renderer/components/Sidebar";
import { Button } from "@renderer/components/ui/button";
import { Kbd } from "@renderer/components/ui/kbd";
import { AgentPanel } from "@renderer/features/agent-panel/AgentPanel";
import { CommandPalette } from "@renderer/features/command-palette/CommandPalette";
import type { ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";

interface LayoutProps {
  sidebar?: ReactNode;
  agent?: ReactNode;
}

export function Layout({ sidebar = <Sidebar />, agent = <AgentPanel /> }: LayoutProps) {
  const location = useLocation();
  const crumb = location.pathname.startsWith("/apps")
    ? "Applications"
    : location.pathname.startsWith("/issues")
      ? "Issues"
      : location.pathname.startsWith("/performance")
        ? "Performance"
        : location.pathname.startsWith("/settings")
          ? "SDK setup"
          : "Issues";

  return (
    <div className="block bg-canvas min-h-screen tablet:grid tablet:grid-cols-[190px_minmax(0,1fr)] desktop:grid-cols-[190px_minmax(0,1fr)_310px] wide:grid-cols-[224px_minmax(0,1fr)_360px]">
      {sidebar}
      <main className="flex min-w-0 flex-col h-auto tablet:h-screen">
        <header className="hidden tablet:flex h-14 items-center gap-3.5 border-b border-hairline px-6">
          <div className="flex min-w-0 items-center gap-2 text-subtle">
            <span>Frontend Platform</span>
            <span className="text-hairline-strong">/</span>
            <b className="font-medium text-muted">{crumb}</b>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm">
              Search or jump to… <Kbd>⌘ K</Kbd>
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-visible tablet:overflow-auto">
          <Outlet />
        </div>
      </main>
      {agent}
      <CommandPalette />
    </div>
  );
}
