import { useRegisterCommands } from "@renderer/commands";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@renderer/components/ui/popover";
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@renderer/components/ui/sidebar";
import { useCurrentApp } from "@renderer/context/current-app";
import { useIssues } from "@renderer/hooks/use-issues";
import { cn } from "@renderer/lib/utils";
import {
  Activity,
  AlertTriangle,
  AppWindow,
  BarChart3,
  Check,
  Fingerprint,
  Plus,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { CreateAppModal } from "./CreateAppModal";

type NavigationItem = {
  icon: LucideIcon;
  label: string;
  to: string;
  badge?: number;
};

export function Sidebar() {
  return (
    <SidebarRoot
      aria-label="Primary navigation"
      className="relative z-20 w-[60px] shrink-0 overflow-visible border-r border-hairline bg-[rgba(18,19,23,0.84)] px-2.5 pb-3 backdrop-blur-2xl"
    >
      <SidebarHeader className="items-center pt-3">
        <div className="grid h-7.5 w-9 place-items-center" aria-label="Traceability">
          <Fingerprint size={20} className="text-primary-hover" />
        </div>
      </SidebarHeader>
      <SidebarContent className="items-center">
        <SidebarGroup className="items-center pt-3">
          <SidebarGroupContent>
            <SidebarMenu className="items-center">
              <AppSwitcher />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="items-center pt-3">
          <SidebarGroupContent>
            <SidebarMenu className="items-center">
              <MonitorNavigation />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="items-center border-t border-hairline pt-2.5">
        <span
          className="size-1.5 rounded-full bg-success"
          style={{ boxShadow: "0 0 0 3px rgba(88,199,123,0.1)" }}
          title="Connected to Traceability"
        />
      </SidebarFooter>
    </SidebarRoot>
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

function AppSwitcher() {
  const { apps, currentApp, setAppId } = useCurrentApp();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("traceability:open-app-switcher", onOpen);
    return () => window.removeEventListener("traceability:open-app-switcher", onOpen);
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
        action: () => {
          window.dispatchEvent(new CustomEvent("traceability:open-app-switcher"));
        },
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
      <SidebarMenuItem>
        <PopoverTrigger
          render={
            <SidebarMenuButton
              type="button"
              title="Switch application"
              aria-label="Switch application"
              className={cn(
                "min-h-9 w-9 border border-hairline bg-white/[0.035] p-1 text-left hover:border-hairline-strong hover:bg-white/[0.065]",
                open && "border-hairline-strong bg-white/[0.065]",
              )}
            />
          }
        >
          <span
            className="grid size-7 place-items-center rounded-lg text-[10px] font-bold text-white"
            style={{ background: "linear-gradient(145deg,#9ba7ff,#626fd2)" }}
          >
            {currentApp ? initials(currentApp.name) : "··"}
          </span>
        </PopoverTrigger>
      </SidebarMenuItem>
      <PopoverContent
        side="right"
        sideOffset={8}
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

function MonitorNavigation() {
  const { appId } = useCurrentApp();
  const { data } = useIssues({ appId, status: "open", limit: 100 });

  return (
    <SidebarNavigationMenu
      label="Monitor"
      icon={Activity}
      items={[
        { icon: AlertTriangle, label: "Issues", to: "/issues", badge: data?.items.length ?? 0 },
        { icon: BarChart3, label: "Performance", to: "/performance" },
      ]}
    />
  );
}

function SidebarNavigationMenu({
  label,
  icon: Icon,
  items,
}: {
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = items.some((item) => location.pathname.startsWith(item.to));

  return (
    <DropdownMenu>
      <SidebarMenuItem>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              type="button"
              title={label}
              aria-label={label}
              isActive={isActive}
              className={cn(
                "size-9 border border-hairline bg-white/[0.025] text-muted hover:border-hairline-strong hover:bg-white/[0.07] hover:text-ink",
                isActive && "border-hairline-strong bg-white/[0.07] text-ink",
              )}
            />
          }
        >
          <Icon size={17} className={cn(isActive && "text-primary-hover")} />
        </DropdownMenuTrigger>
      </SidebarMenuItem>
      <DropdownMenuContent side="right" sideOffset={8} align="start" className="w-[218px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {items.map((item) => {
            const active = location.pathname.startsWith(item.to);
            const ItemIcon = item.icon;
            return (
              <DropdownMenuItem
                key={item.to}
                label={item.label}
                onClick={() => navigate(item.to)}
                className={cn(active && "bg-primary/15 font-[610] text-ink")}
              >
                <ItemIcon size={14} />
                <span>{item.label}</span>
                {item.badge !== undefined ? (
                  <span
                    className={cn(
                      "ml-auto text-[11px] tabular-nums text-tertiary",
                      active && "text-primary-hover",
                    )}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
