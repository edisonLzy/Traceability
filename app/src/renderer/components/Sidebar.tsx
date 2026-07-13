import { CreateAppModal } from "@renderer/components/CreateAppModal";
import { useCurrentApp } from "@renderer/context/current-app";
import { useIssues } from "@renderer/hooks/use-issues";
import { cn } from "@renderer/lib/utils";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Check,
  Fingerprint,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

export function Sidebar() {
  return (
    <aside className="relative z-20 flex flex-col items-center gap-3 overflow-visible border-r border-hairline bg-[rgba(18,19,23,0.84)] px-2.5 pb-3 pt-[42px] backdrop-blur-2xl">
      <div className="grid h-7.5 w-9 place-items-center">
        <Fingerprint size={20} className="text-primary-hover" />
      </div>
      <AppSwitcher />
      <NavGroup />
      <div className="mt-auto flex items-center justify-center border-t border-hairline pt-2.5">
        <span
          className="size-1.5 rounded-full bg-success"
          style={{ boxShadow: "0 0 0 3px rgba(88,199,123,0.1)" }}
          title="Connected to Traceability"
        />
      </div>
    </aside>
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

function useOpenOnHoverFocus(): {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  wrapperProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
} {
  const [open, setOpen] = useState(false);
  return {
    open,
    setOpen,
    wrapperProps: {
      onMouseEnter: () => setOpen(true),
      onMouseLeave: () => setOpen(false),
      onFocus: () => setOpen(true),
      onBlur: () => setOpen(false),
    },
  };
}

function AppSwitcher() {
  const { apps, currentApp, setAppId } = useCurrentApp();
  const { open, setOpen, wrapperProps } = useOpenOnHoverFocus();
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // "Switch application" command (⌘A) opens the popover and focuses search.
  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setTimeout(() => searchRef.current?.focus(), 60);
    };
    window.addEventListener("traceability:open-app-switcher", onOpen);
    return () => window.removeEventListener("traceability:open-app-switcher", onOpen);
  }, [setOpen]);

  // Close on Escape / outside click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const filtered = apps.filter((app) => {
    const q = query.trim().toLowerCase();
    return !q || `${app.name} ${app.repoUrl}`.toLowerCase().includes(q);
  });

  return (
    <div className="relative" {...wrapperProps}>
      <button
        type="button"
        title="Switch application"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "grid min-h-9 w-9 grid-cols-1 place-items-center gap-0 rounded-[10px] border border-hairline bg-white/[0.035] p-1 text-left transition-colors hover:border-hairline-strong hover:bg-white/[0.065]",
          open && "border-hairline-strong bg-white/[0.065]",
        )}
      >
        <span
          className="grid size-7 place-items-center rounded-lg text-[10px] font-bold text-white"
          style={{ background: "linear-gradient(145deg,#9ba7ff,#626fd2)" }}
        >
          {currentApp ? initials(currentApp.name) : "··"}
        </span>
      </button>

      {open && (
        <div
          className="absolute left-[calc(100%+8px)] top-0 z-40 w-[340px] rounded-[14px] border border-hairline-strong bg-[rgba(28,29,35,0.92)] p-1.5 shadow-[0_16px_50px_rgba(0,0,0,0.34),0_2px_12px_rgba(0,0,0,0.22)] backdrop-blur-2xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <label className="flex h-8.5 items-center gap-2 rounded-lg border border-hairline bg-black/20 px-2.5 text-tertiary">
            <Search size={14} />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search applications"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-ink outline-none placeholder:text-tertiary"
            />
          </label>
          <div className="px-2.5 pb-1 pt-3 text-[10px] font-[670] uppercase tracking-[0.09em] text-tertiary">
            Applications
          </div>
          <div ref={listRef} className="max-h-[235px] overflow-auto">
            {filtered.length === 0 && (
              <div className="px-5 py-12 text-center text-[12px] text-tertiary">
                No applications found.
              </div>
            )}
            {filtered.map((app) => {
              const selected = currentApp?.id === app.id;
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => {
                    setAppId(app.id);
                    setOpen(false);
                    setQuery("");
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
                    <small className="block truncate text-[10px] text-tertiary">
                      {app.repoUrl}
                    </small>
                  </span>
                  {selected && <Check size={14} className="text-primary-hover" />}
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
        </div>
      )}

      <CreateAppModal open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}

function NavGroup() {
  const { appId } = useCurrentApp();
  const { data } = useIssues({ appId, status: "open", limit: 100 });
  const openCount = data?.items.length ?? 0;
  const { open, wrapperProps } = useOpenOnHoverFocus();
  const location = useLocation();
  const headingActive =
    location.pathname.startsWith("/issues") || location.pathname.startsWith("/performance");

  return (
    <div className="relative" {...wrapperProps}>
      <NavLink
        to="/issues"
        title="Monitor"
        className={cn(
          "grid size-9 place-items-center rounded-[10px] border border-hairline bg-white/[0.025] text-muted transition-colors hover:border-hairline-strong hover:bg-white/[0.07] hover:text-ink",
          headingActive && "border-hairline-strong bg-white/[0.07] text-ink",
        )}
      >
        <Activity size={17} className={cn(headingActive && "text-primary-hover")} />
      </NavLink>

      {open && (
        <div className="absolute left-[calc(100%+8px)] top-0 z-40 w-[218px] rounded-[12px] border border-hairline-strong bg-[rgba(28,29,35,0.92)] p-1.5 shadow-[0_16px_50px_rgba(0,0,0,0.34),0_2px_12px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
          <div className="px-1.5 py-1.5 text-[10px] font-[660] uppercase tracking-[0.08em] text-tertiary">
            Monitor
          </div>
          <NavItem
            to="/issues"
            icon={<AlertTriangle size={14} />}
            label="Issues"
            count={openCount}
          />
          <NavItem to="/performance" icon={<BarChart3 size={14} />} label="Performance" />
        </div>
      )}
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  count,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  const match = to === "/performance" ? "performance" : "issues";
  const location = useLocation();
  const active =
    match === "performance"
      ? location.pathname.startsWith("/performance")
      : location.pathname.startsWith("/issues");
  return (
    <NavLink
      to={to}
      className={cn(
        "flex h-8.5 items-center gap-2 rounded-lg px-2 text-[12px] text-tertiary transition-colors hover:bg-white/[0.055] hover:text-muted",
        active && "bg-primary/15 text-ink font-[610]",
      )}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            "ml-auto text-[11px] tabular-nums text-tertiary",
            active && "text-primary-hover",
          )}
        >
          {count}
        </span>
      )}
    </NavLink>
  );
}
