import { useCurrentApp } from "@renderer/context/current-app";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import type { Session } from "@renderer/store/agent";
import {
  AlertTriangle,
  AppWindow,
  BarChart3,
  MessageCircle,
  MessagesSquare,
  Search,
  SquarePen,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type Mode = "global" | "sessions";

interface Entry {
  id: string;
  icon: typeof AlertTriangle;
  title: string;
  subtitle: string;
  key: string;
}

export function CommandPalette() {
  const { invoke } = useElectronIPC();
  const { currentApp, appId } = useCurrentApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("global");
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPalette = useCallback((m: Mode) => {
    setMode(m);
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }, []);
  const invokeSession = useCallback(
    <T,>(channel: string, ...args: unknown[]): Promise<T> => {
      return (invoke as unknown as (name: string, ...parameters: unknown[]) => Promise<T>)(
        channel,
        ...args,
      );
    },
    [invoke],
  );

  // Open via ⌘K (global) / ⌘G (sessions), or via the layout command trigger.
  useEffect(() => {
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: Mode }>).detail;
      openPalette(detail?.mode === "sessions" ? "sessions" : "global");
    };
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette("global");
        return;
      }
      if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        openPalette("sessions");
      }
    };
    window.addEventListener("traceability:command-palette", onEvent);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("traceability:command-palette", onEvent);
      document.removeEventListener("keydown", onKey);
    };
  }, [openPalette]);

  // Load sessions when entering sessions mode.
  useEffect(() => {
    if (!open || mode !== "sessions" || !appId) return;
    void invokeSession<Session[]>("sessions:list", appId)
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [open, mode, appId, invokeSession]);

  // Focus input on open.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 180);
  }, [open]);

  const entries: Entry[] = useMemo(() => {
    if (mode === "sessions") {
      return sessions.map((s) => ({
        id: `session:${s.id}`,
        icon: MessageCircle,
        title: s.name || "New conversation",
        subtitle: relativeUpdated(s.updatedAt),
        key: "",
      }));
    }
    return [
      {
        id: "navigate:issues",
        icon: AlertTriangle,
        title: "Go to Issues",
        subtitle: "Monitor",
        key: "G I",
      },
      {
        id: "navigate:performance",
        icon: BarChart3,
        title: "Go to Performance",
        subtitle: "Monitor",
        key: "G P",
      },
      {
        id: "session:new",
        icon: SquarePen,
        title: "New conversation",
        subtitle: `Agent · ${currentApp?.name ?? "-"}`,
        key: "⌘N",
      },
      {
        id: "session:picker",
        icon: MessagesSquare,
        title: "Switch conversation",
        subtitle: `${sessions.length || "—"} conversations in this application`,
        key: "⌘G",
      },
      {
        id: "application:switch",
        icon: AppWindow,
        title: "Switch application",
        subtitle: "Change monitor and agent scope",
        key: "⌘A",
      },
    ];
  }, [mode, sessions, currentApp]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => !q || `${e.title} ${e.subtitle}`.toLowerCase().includes(q));
  }, [entries, query]);

  useEffect(() => {
    if (activeIndex >= visible.length) setActiveIndex(Math.max(0, visible.length - 1));
  }, [visible, activeIndex]);

  const close = useCallback(() => setOpen(false), []);

  const execute = useCallback(
    (id: string) => {
      if (id === "navigate:issues") {
        close();
        nav("/issues");
        return;
      }
      if (id === "navigate:performance") {
        close();
        nav("/performance");
        return;
      }
      if (id === "session:new") {
        close();
        window.dispatchEvent(new CustomEvent("traceability:agent-new-session"));
        toast("New conversation started");
        return;
      }
      if (id === "session:picker") {
        setMode("sessions");
        setQuery("");
        setActiveIndex(0);
        return;
      }
      if (id === "application:switch") {
        close();
        window.dispatchEvent(new CustomEvent("traceability:open-app-switcher"));
        return;
      }
      if (id.startsWith("session:")) {
        const sid = id.slice("session:".length);
        close();
        window.dispatchEvent(
          new CustomEvent("traceability:agent-select-session", { detail: { sessionId: sid } }),
        );
        toast("Conversation switched");
      }
    },
    [close, nav],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(visible.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const entry = visible[activeIndex];
      if (entry) execute(entry.id);
    }
  };

  if (!open) return null;

  const title = mode === "sessions" ? "Switch conversation" : "Commands";
  const placeholder =
    mode === "sessions"
      ? `Search conversations in ${currentApp?.name ?? "application"}`
      : "Search commands";

  return (
    <div
      className="fixed inset-0 z-[90] grid justify-center bg-black/40 pt-[min(16vh,142px)]"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-[min(570px,calc(100vw-48px))] overflow-hidden rounded-[14px] border border-hairline-strong bg-[rgba(31,32,38,0.9)] shadow-[0_16px_50px_rgba(0,0,0,0.34),0_2px_12px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
        <div className="flex h-12 items-center gap-2.5 border-b border-hairline px-3 text-tertiary">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKey}
            placeholder={placeholder}
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-tertiary"
          />
          <kbd className="font-mono text-[10px] text-tertiary">
            {mode === "sessions" ? "⌘G" : "⌘K"}
          </kbd>
        </div>
        <div className="px-3 pt-2.5 pb-1 text-[10px] font-[660] uppercase tracking-[0.08em] text-tertiary">
          {title}
        </div>
        <div className="max-h-[390px] overflow-auto p-1.5 pb-2">
          {visible.length === 0 && (
            <div className="px-3 py-6 text-center text-[11px] text-tertiary">
              No matching commands or conversations.
            </div>
          )}
          {visible.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => execute(entry.id)}
              className={cn(
                "grid w-full grid-cols-[27px_minmax(0,1fr)_auto] items-center gap-2 rounded-[9px] px-2 py-2 text-left text-muted transition-colors",
                index === activeIndex ? "bg-white/[0.075] text-ink" : "hover:bg-white/[0.05]",
              )}
            >
              <span className="grid size-[27px] place-items-center rounded-[7px] bg-white/[0.06] text-primary-hover">
                <entry.icon size={14} />
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-[12px] font-[620]">{entry.title}</strong>
                <small className="mt-0.5 block truncate text-[10px] text-tertiary">
                  {entry.subtitle}
                </small>
              </span>
              {entry.key && (
                <span className="font-mono text-[10px] text-tertiary">{entry.key}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function relativeUpdated(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.round(diff / 60000);
  if (min < 1) return "Now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}
