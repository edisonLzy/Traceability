import { useCommandPalette, useRegisterCommands } from "@renderer/commands";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { useCurrentApp } from "@renderer/context/current-app";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, AppWindow, BarChart3, Command, Radio, RefreshCw } from "lucide-react";
import { useCallback } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { AgentPanel } from "./_agent";
import { CommandPalette } from "./_components/CommandPalette";
import { Sidebar } from "./_components/Sidebar";
import { Titlebar } from "./_components/Titlebar";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentApp } = useCurrentApp();
  const queryClient = useQueryClient();
  const { open: openCommands } = useCommandPalette();

  const crumb = (() => {
    if (location.pathname.startsWith("/performance")) return "Monitor / Performance";
    const issueMatch = location.pathname.match(/^\/issues\/(.+)$/);
    if (issueMatch) return `Monitor / Issues / ${issueMatch[1]}`;
    return "Monitor / Issues";
  })();

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries();
    toast("Monitoring data refreshed");
  }, [queryClient]);

  useRegisterCommands(
    () => [
      {
        id: "navigation.issues",
        group: { id: "navigation", label: "Navigation", order: 10 },
        title: "Go to Issues",
        description: "Open issue monitoring",
        icon: AlertTriangle,
        keywords: ["monitor", "errors"],
        shortcut: "G I",
        action: () => navigate("/issues"),
      },
      {
        id: "navigation.performance",
        group: { id: "navigation", label: "Navigation", order: 10 },
        title: "Go to Performance",
        description: "Open performance monitoring",
        icon: BarChart3,
        keywords: ["monitor"],
        shortcut: "G P",
        action: () => navigate("/performance"),
      },
      {
        id: "monitor.refresh",
        group: { id: "monitor", label: "Monitor", order: 20 },
        title: "Refresh monitoring data",
        description: "Reload issues and performance data",
        icon: RefreshCw,
        keywords: ["reload"],
        shortcut: "R",
        action: refresh,
      },
      {
        id: "application.switch",
        group: { id: "application", label: "Application", order: 30 },
        title: "Switch application",
        description: "Change monitor and agent scope",
        icon: AppWindow,
        shortcut: "⌘ A",
        action: () => {
          window.dispatchEvent(new CustomEvent("traceability:open-app-switcher"));
        },
      },
    ],
    [navigate, refresh],
  );

  return (
    <div className="h-screen overflow-hidden">
      <Titlebar />
      <div className="flex h-full pt-[30px]">
        <Sidebar />
        <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
          <ResizablePanel defaultSize="60%" minSize="45%">
            <main className="flex h-full min-w-0 flex-col">
              <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline bg-[rgba(12,13,16,0.55)] px-[22px] backdrop-blur-xl">
                <nav className="flex min-w-0 items-center gap-2 text-[12px] text-tertiary">
                  <span className="truncate">{currentApp?.name ?? "—"}</span>
                  <span className="text-[#55565d]">/</span>
                  <b className="truncate font-[570] text-muted">{crumb}</b>
                </nav>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openCommands}
                    title="Open command palette"
                    className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-hairline bg-white/[0.035] px-2 text-[10px] text-tertiary transition-colors hover:border-hairline-strong hover:bg-white/[0.07] hover:text-muted"
                  >
                    <Command size={13} /> Command <kbd className="font-mono">⌘K</kbd>
                  </button>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-tertiary">
                    <Radio size={11} className="text-success" /> Live updates
                  </span>
                  <button
                    type="button"
                    onClick={refresh}
                    title="Refresh data"
                    className="grid size-7 place-items-center rounded-[7px] text-tertiary transition-colors hover:bg-white/10 hover:text-ink"
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-auto">
                <Outlet />
              </div>
            </main>
          </ResizablePanel>
          <ResizableHandle className="w-px bg-hairline transition-colors hover:bg-primary/70 focus-visible:bg-primary" />
          <ResizablePanel defaultSize="40%" minSize="30%" maxSize="55%">
            <AgentPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <CommandPalette />
    </div>
  );
}
