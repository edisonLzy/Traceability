import { useRegisterCommands } from "@renderer/commands";
import { Popover, PopoverContent, PopoverTrigger } from "@renderer/components/ui/popover";
import { useCurrentApp } from "@renderer/context/current-app";
import { cn } from "@renderer/lib/utils";
import { AppWindow, Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CreateAppModal } from "./CreateAppModal";

/**
 * App switcher mounted in the header breadcrumb. Owns the app switch + create
 * commands and their popovers/modal, following the same co-location pattern as
 * RefreshButton (UI + command registration in one component).
 */
export function HeaderAppSwitcher() {
  const { apps, currentApp, setAppId } = useCurrentApp();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpenSwitcher = () => setOpen(true);
    const onCreateApp = () => setShowCreate(true);
    window.addEventListener("traceability:open-app-switcher", onOpenSwitcher);
    window.addEventListener("traceability:create-app", onCreateApp);
    return () => {
      window.removeEventListener("traceability:open-app-switcher", onOpenSwitcher);
      window.removeEventListener("traceability:create-app", onCreateApp);
    };
  }, []);

  useRegisterCommands(
    () => [
      {
        id: "application.switch",
        group: { id: "application", label: "Application", order: 30 },
        title: "Switch application",
        description: "Change monitor and agent scope",
        icon: AppWindow,
        shortcut: "⌘ A",
        action: () => setOpen(true),
      },
      {
        id: "application.create",
        group: { id: "application", label: "Application", order: 30 },
        title: "Create application",
        description: "Register a new application to monitor",
        icon: Plus,
        action: () => setShowCreate(true),
      },
    ],
    [],
  );

  const filtered = apps.filter((app) => {
    const normalizedQuery = query.trim().toLowerCase();
    return !normalizedQuery || `${app.name} ${app.repoUrl}`.toLowerCase().includes(normalizedQuery);
  });

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            title="Switch application"
            aria-label="Switch application"
            className={cn(
              "inline-flex min-w-0 items-center gap-1.5 rounded-[7px] px-1.5 text-[12px] text-tertiary transition-colors hover:bg-white/[0.05] hover:text-ink",
              open && "bg-white/[0.05] text-ink",
            )}
          />
        }
      >
        <span
          className="grid size-4 shrink-0 place-items-center rounded-[4px] text-[8px] font-bold text-white"
          style={{ background: "linear-gradient(145deg,#9ba7ff,#626fd2)" }}
        >
          {currentApp ? initials(currentApp.name) : "··"}
        </span>
        <span className="truncate">{currentApp?.name ?? "Select application"}</span>
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        sideOffset={6}
        align="start"
        initialFocus={searchRef}
        className="w-[340px] p-1.5"
      >
        <label className="flex h-8.5 items-center gap-2 rounded-lg border border-hairline bg-black/20 px-2.5 text-tertiary">
          <Search size={14} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search applications"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-ink outline-none placeholder:text-tertiary"
          />
        </label>
        <div className="px-2.5 pb-1 pt-3 text-[10px] font-[670] uppercase tracking-[0.09em] text-tertiary">
          Applications
        </div>
        <div className="max-h-[235px] overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-[12px] text-tertiary">
              No applications found.
            </div>
          ) : null}
          {filtered.map((app) => {
            const selected = currentApp?.id === app.id;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => {
                  setAppId(app.id);
                  setOpen(false);
                }}
                className={cn(
                  "grid w-full grid-cols-[28px_minmax(0,1fr)_18px] items-center gap-2.5 rounded-[9px] px-1.5 py-1.5 text-left text-muted transition-colors hover:bg-white/[0.07] hover:text-ink",
                  selected && "bg-primary/15 text-ink",
                )}
              >
                <span
                  className="grid size-7 place-items-center rounded-lg text-[10px] font-bold text-white"
                  style={{ background: "linear-gradient(145deg,#9ba7ff,#626fd2)" }}
                >
                  {initials(app.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-[610]">{app.name}</span>
                  <small className="block truncate text-[10px] text-tertiary">{app.repoUrl}</small>
                </span>
                {selected ? <Check size={14} className="text-primary-hover" /> : null}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5 border-t border-hairline px-0.5 pt-1.5">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setShowCreate(true);
            }}
            className="inline-flex h-7.5 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] text-primary-hover transition-colors hover:bg-primary/15"
          >
            <Plus size={14} /> Add application
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto inline-flex h-7.5 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] text-muted transition-colors hover:bg-white/[0.07] hover:text-ink"
          >
            <X size={14} /> Close
          </button>
        </div>
      </PopoverContent>
      <CreateAppModal open={showCreate} onOpenChange={setShowCreate} />
    </Popover>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/[-\s]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .padEnd(2, "A") || "AA"
  );
}
