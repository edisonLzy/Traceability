import { useCommandPalette, useRegisterCommands } from "@renderer/commands";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { AlertTriangle, BarChart3, Command, Compass, Inbox, Radio } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { AgentPanel } from "./_agent";
import { CommandPalette } from "./_components/CommandPalette";
import { HeaderAppSwitcher } from "./_components/HeaderAppSwitcher";
import { RefreshButton } from "./_components/RefreshButton";
import { Sidebar } from "./_components/Sidebar";
import { Titlebar } from "./_components/Titlebar";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { open: openCommands } = useCommandPalette();

  const crumb = (() => {
    if (location.pathname === "/inbox") return "Inbox";
    if (location.pathname === "/explorer") return "Explorer";
    if (location.pathname === "/monitor/performance") return "Monitor / Performance";
    const issueMatch = location.pathname.match(/^\/monitor\/issues\/(.+)$/);
    if (issueMatch) return `Monitor / Issues / ${issueMatch[1]}`;
    return "Monitor / Issues";
  })();

  useRegisterCommands(
    () => [
      {
        id: "navigation.inbox",
        group: { id: "navigation", label: "Navigation", order: 10 },
        title: "Go to Inbox",
        description: "Open the inbox",
        icon: Inbox,
        keywords: ["home"],
        shortcut: "G B",
        action: () => navigate("/inbox"),
      },
      {
        id: "navigation.issues",
        group: { id: "navigation", label: "Navigation", order: 10 },
        title: "Go to Issues",
        description: "Open issue monitoring",
        icon: AlertTriangle,
        keywords: ["monitor", "errors"],
        shortcut: "G I",
        action: () => navigate("/monitor/issues"),
      },
      {
        id: "navigation.performance",
        group: { id: "navigation", label: "Navigation", order: 10 },
        title: "Go to Performance",
        description: "Open performance monitoring",
        icon: BarChart3,
        keywords: ["monitor"],
        shortcut: "G P",
        action: () => navigate("/monitor/performance"),
      },
      {
        id: "navigation.explorer",
        group: { id: "navigation", label: "Navigation", order: 10 },
        title: "Go to Explorer",
        description: "Open the explorer",
        icon: Compass,
        keywords: ["browse"],
        shortcut: "G X",
        action: () => navigate("/explorer"),
      },
    ],
    [navigate],
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
                  <HeaderAppSwitcher />
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
                  <RefreshButton />
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
