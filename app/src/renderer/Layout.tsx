import { Sidebar } from "@renderer/components/Sidebar";
import { Titlebar } from "@renderer/components/Titlebar";
import { useCurrentApp } from "@renderer/context/current-app";
import { AgentPanel } from "@renderer/features/agent-panel/AgentPanel";
import { CommandPalette } from "@renderer/features/command-palette/CommandPalette";
import { useQueryClient } from "@tanstack/react-query";
import { Command, Radio, RefreshCw } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";

export function Layout() {
  const location = useLocation();
  const { currentApp } = useCurrentApp();
  const queryClient = useQueryClient();

  const crumb = (() => {
    if (location.pathname.startsWith("/performance")) return "Monitor / Performance";
    const issueMatch = location.pathname.match(/^\/issues\/(.+)$/);
    if (issueMatch) return `Monitor / Issues / ${issueMatch[1]}`;
    return "Monitor / Issues";
  })();

  const refresh = async () => {
    await queryClient.invalidateQueries();
    toast("Monitoring data refreshed");
  };

  const openCommands = () =>
    window.dispatchEvent(
      new CustomEvent("traceability:command-palette", { detail: { mode: "global" } }),
    );

  return (
    <>
      <Titlebar />
      <div
        className="grid h-screen"
        style={{ gridTemplateColumns: "60px minmax(0,1fr) var(--agent-width,360px)" }}
      >
        <Sidebar />
        <main className="flex min-w-0 flex-col pt-[30px]">
          <header className="flex h-12 items-center gap-2 border-b border-hairline bg-[rgba(12,13,16,0.55)] px-[22px] backdrop-blur-xl">
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
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </main>
        <AgentPanel />
        <CommandPalette />
      </div>
    </>
  );
}
