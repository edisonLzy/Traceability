import { useCurrentApp } from "@renderer/context/current-app";
import type { AgentPromptEvent } from "@renderer/lib/agent-events";
import { cn } from "@renderer/lib/utils";
import { useIssue } from "@renderer/pages/issues/hooks/use-issue";
import type {
  AgentEntry,
  AgentPromptInput,
  AgentSessionDetail,
  AgentSessionSummary,
  AvailableModel,
} from "@shared/ipc";
import {
  AlertTriangle,
  AppWindow,
  ArrowUp,
  BarChart3,
  ChevronDown,
  CircleStop,
  MessageCircle,
  Sparkles,
  SquarePlus,
  Wrench,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Streamdown } from "streamdown";

const RANGE_LABEL: Record<number, string> = {
  1: "Last hour",
  24: "Last 24 hours",
  168: "Last 7 days",
};

export function AgentPanel() {
  const { currentApp, appId } = useCurrentApp();
  const location = useLocation();
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState<AgentSessionDetail | null>(null);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [context, setContext] = useState<AgentPromptInput["context"] | null>(null);
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  // Pinned issue title (for the context chip).
  const pinnedIssueId = context?.source === "issue" ? context.issueId : undefined;
  const issueQuery = useIssue(pinnedIssueId);

  // Refs to avoid stale closures in the global prompt-event handler.
  const ref = useRef({ appId, sessionId, models, running });
  ref.current = { appId, sessionId, models, running };

  // Load available models once.
  useEffect(() => {
    void window.traceability.agent
      .listModels()
      .then(setModels)
      .catch((c) => setError(toError(c)));
  }, []);

  // Load sessions whenever the active application changes; ensure one exists.
  useEffect(() => {
    if (!appId) {
      setSessions([]);
      setSessionId("");
      setSession(null);
      return;
    }
    let cancelled = false;
    void window.traceability.sessions
      .list(appId)
      .then(async (items) => {
        if (cancelled) return;
        if (items.length > 0) {
          setSessions(items);
          setSessionId(items[0]!.id);
          return;
        }
        // No conversation yet for this application - start one.
        const created = await window.traceability.sessions.create(appId);
        if (cancelled) return;
        setSessions([created]);
        setSessionId(created.id);
      })
      .catch((c) => setError(toError(c)));
    return () => {
      cancelled = true;
    };
  }, [appId]);

  // Load session detail when the active session changes.
  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return;
    }
    void loadSession(sessionId, setSession, setError);
  }, [sessionId]);

  // Stream agent updates; reload session + session list when a run ends.
  useEffect(() => {
    return window.traceability.agent.onEvent((event) => {
      if (event.sessionId !== ref.current.sessionId) return;
      if (event.type === "agent_start" || event.type === "run_started") setRunning(true);
      if (event.type === "agent_end" || event.type === "run_failed") {
        setRunning(false);
        void loadSession(event.sessionId, setSession, setError);
        if (ref.current.appId)
          void window.traceability.sessions.list(ref.current.appId).then(setSessions);
      }
    });
  }, []);

  const createSession = useCallback(async (): Promise<string | null> => {
    const { appId, sessionId } = ref.current;
    if (!appId) return null;
    if (sessionId) return sessionId;
    const created = await window.traceability.sessions.create(appId);
    setSessions((items) => [created, ...items]);
    setSessionId(created.id);
    return created.id;
  }, []);

  const sendPrompt = useCallback(
    async (sid: string, prompt: string, ctx: AgentPromptInput["context"]) => {
      const model = ref.current.models[0];
      if (!model) {
        setError("No compatible model is configured in ~/.pi/agent-core/models.json");
        return;
      }
      try {
        setError("");
        setRunning(true);
        setText("");
        await window.traceability.agent.prompt({
          sessionId: sid,
          text: prompt,
          model: { providerId: model.providerId, modelId: model.modelId },
          context: ctx,
        });
        void loadSession(sid, setSession, setError);
      } catch (cause) {
        setRunning(false);
        setError(toError(cause));
      }
    },
    [],
  );

  // External "pin context + run" requests from pages.
  const handlePrompt = useCallback(
    async (event: Event) => {
      const detail = (event as CustomEvent<AgentPromptEvent>).detail;
      if (!detail) return;
      setContext(detail.context);
      const sid = await createSession();
      if (!sid) return;
      await sendPrompt(sid, detail.prompt, detail.context);
    },
    [createSession, sendPrompt],
  );

  useEffect(() => {
    window.addEventListener("traceability:agent-prompt", handlePrompt);
    return () => window.removeEventListener("traceability:agent-prompt", handlePrompt);
  }, [handlePrompt]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (running) {
      void window.traceability.agent.abort(sessionId);
      return;
    }
    const trimmed = text.trim();
    if (!trimmed || !sessionId) return;
    const ctx: AgentPromptInput["context"] =
      context && context.source !== "general" ? context : { appId, source: "general" };
    void sendPrompt(sessionId, trimmed, ctx);
  };

  const newConversation = useCallback(async () => {
    setMenuOpen(false);
    if (!appId) return;
    try {
      const created = await window.traceability.sessions.create(appId);
      setSessions((items) => [created, ...items]);
      setSessionId(created.id);
      setContext(null);
    } catch (cause) {
      setError(toError(cause));
    }
  }, [appId]);

  // External controls from the command palette.
  useEffect(() => {
    const onNew = () => void newConversation();
    const onSelect = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId: string }>).detail;
      if (detail?.sessionId) setSessionId(detail.sessionId);
    };
    window.addEventListener("traceability:agent-new-session", onNew);
    window.addEventListener("traceability:agent-select-session", onSelect);
    return () => {
      window.removeEventListener("traceability:agent-new-session", onNew);
      window.removeEventListener("traceability:agent-select-session", onSelect);
    };
  }, [newConversation]);

  const clearContext = () => setContext({ appId, source: "general" });

  const suggestions = suggestionData(context, location.pathname);
  const statusCopy = running ? "Investigating" : "Traceability Agent";
  const chips = contextChips({
    appName: currentApp?.name ?? appId,
    context,
    issueTitle: issueQuery.data?.title,
    pathname: location.pathname,
  });

  return (
    <aside
      className="relative flex min-w-0 flex-col border-l border-hairline bg-[rgba(18,19,23,0.75)] pt-[30px] backdrop-blur-2xl"
      aria-label="Traceability Agent"
    >
      <Resizer />

      {/* Header */}
      <header className="relative flex min-h-12 items-center gap-2 border-b border-hairline px-2.5">
        <span className="grid size-[27px] place-items-center rounded-[9px] bg-primary/15 text-primary-hover">
          <Sparkles size={15} />
        </span>
        <button
          type="button"
          title="Switch conversation"
          onClick={() => setMenuOpen((v) => !v)}
          className="min-w-0 flex-1 rounded-[7px] px-1.5 py-1 text-left transition-colors hover:bg-white/[0.06]"
        >
          <strong className="block truncate text-[12px] font-[650] text-ink">
            {session?.title || "New conversation"}
          </strong>
          <small className="mt-0.5 flex items-center gap-1.5 text-[10px] text-tertiary">
            <span>{statusCopy}</span>
            <kbd className="border border-hairline rounded px-1 font-mono text-[9px]">⌘G</kbd>
          </small>
        </button>
        <button
          type="button"
          title="New conversation"
          onClick={newConversation}
          className="grid size-[27px] place-items-center rounded-[7px] text-tertiary transition-colors hover:bg-white/10 hover:text-ink"
        >
          <SquarePlus size={16} />
        </button>

        {menuOpen && (
          <SessionMenu
            sessions={sessions}
            activeId={sessionId}
            onPick={(id) => {
              setSessionId(id);
              setMenuOpen(false);
            }}
            onNew={newConversation}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </header>

      {/* Context */}
      <section className="border-b border-hairline bg-black/10 px-2.5 py-2">
        <div className="mb-1.5 flex items-center justify-between text-[10px] font-[660] uppercase tracking-[0.08em] text-tertiary">
          <span>Context</span>
          <span>{context && context.source !== "general" ? "Pinned object" : "Automatic"}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className={cn(
                "inline-flex h-[23px] max-w-full items-center gap-1.5 rounded-full border border-hairline bg-white/[0.035] px-2 text-[10px] text-muted",
                chip.object && "border-primary/25 bg-primary/15 text-primary-hover",
              )}
            >
              <chip.icon size={12} className="text-tertiary" />
              <span className="truncate">{chip.text}</span>
              {chip.removable && (
                <button
                  type="button"
                  title="Remove object context"
                  onClick={clearContext}
                  className="grid size-3.5 place-items-center rounded text-inherit hover:bg-white/15"
                >
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
        </div>
      </section>

      {/* Conversation */}
      <section className="min-h-0 flex-1 overflow-auto px-2.5 py-3">
        {(!session || session.entries.filter((e) => e.type === "message").length === 0) &&
          !running && (
            <AssistantMark
              text={`I'm scoped to **${currentApp?.name ?? "this application"}**. I can inspect Issues, event evidence, replay metadata, and Performance summaries. What would you like to investigate?`}
            />
          )}
        {session?.entries
          .filter((entry) => entry.type === "message")
          .map((entry) => (
            <Message key={entry.id} entry={entry} />
          ))}
        {running && <RunIndicator />}
        {error && <div className="my-2 text-[11px] text-danger">{error}</div>}
      </section>

      {/* Composer */}
      <form
        className="border-t border-hairline bg-[rgba(14,15,18,0.86)] px-2.5 py-2.5"
        onSubmit={onSubmit}
      >
        <div className="mb-2 flex gap-1.5 overflow-auto pb-0.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                if (!sessionId || running) return;
                const ctx: AgentPromptInput["context"] =
                  context && context.source !== "general" ? context : { appId, source: "general" };
                void sendPrompt(sessionId, s, ctx);
              }}
              className="flex-none rounded-full border border-hairline bg-white/[0.03] px-2 py-1 text-[10px] text-tertiary transition-colors hover:border-primary/35 hover:bg-primary/15 hover:text-primary-hover"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 rounded-[11px] border border-hairline-strong bg-white/[0.045] p-1.5 focus-within:border-primary/55 focus-within:shadow-[0_0_0_3px_rgba(143,156,255,0.09)]">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                onSubmit(e as unknown as FormEvent<HTMLFormElement>);
              }
            }}
            placeholder="Ask about this application…"
            rows={1}
            disabled={!sessionId || running}
            className="max-h-[90px] min-h-[18px] flex-1 resize-none border-0 bg-transparent px-0.5 py-0.5 text-[12px] leading-[1.4] text-ink outline-none placeholder:text-tertiary disabled:opacity-60"
          />
          <button
            type="submit"
            title={running ? "Cancel run" : "Send message"}
            className={cn(
              "grid size-[29px] flex-none place-items-center rounded-[8px] text-[#111329] transition-colors",
              running ? "bg-danger/20 text-[#ffb2b2]" : "bg-primary hover:bg-primary-hover",
            )}
          >
            {running ? <CircleStop size={15} /> : <ArrowUp size={15} />}
          </button>
        </div>
        <p className="mt-1.5 px-0.5 text-[10px] leading-[1.35] text-tertiary">
          Read-only access to monitoring data. The agent cannot change code, issues, or application
          settings.
        </p>
      </form>
    </aside>
  );
}

function Resizer() {
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const width = Math.max(320, Math.min(480, window.innerWidth - ev.clientX));
      document.documentElement.style.setProperty("--agent-width", `${width}px`);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };
  return (
    <div
      onPointerDown={onPointerDown}
      className="group absolute -left-[5px] top-[30px] bottom-0 z-10 w-2.5 cursor-col-resize"
      aria-hidden="true"
    >
      <span className="absolute left-[3px] top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}

function AssistantMark({ text }: { text: string }) {
  return (
    <article className="mb-3.5 pr-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-[650] text-tertiary">
        <Sparkles size={11} className="text-primary-hover" /> Traceability Agent
      </div>
      <div className="text-[12px] leading-[1.55] text-muted [&_p]:m-0 [&_p+p]:mt-1.5">
        <Streamdown>{text}</Streamdown>
      </div>
    </article>
  );
}

function Message({ entry }: { entry: AgentEntry }) {
  const role = entry.data.role as string | undefined;
  const content = entry.data.content;
  const blocks = Array.isArray(content) ? (content as Array<Record<string, unknown>>) : [];
  const text =
    typeof content === "string"
      ? content
      : blocks
          .filter((block) => block.type === "text" && typeof block.text === "string")
          .map((block) => String(block.text))
          .join("\n");
  const tools = blocks.filter((block) => block.type === "toolCall");

  if (role === "user") {
    return (
      <article className="mb-3.5 flex justify-end pl-9">
        <div className="max-w-full rounded-[13px_13px_4px_13px] border border-primary/25 bg-primary/15 px-3 py-2 text-[12px] leading-[1.55] text-[#e4e7ff]">
          {text}
        </div>
      </article>
    );
  }

  return (
    <article className="mb-3.5 pr-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-[650] text-tertiary">
        <Sparkles size={11} className="text-primary-hover" /> Traceability Agent
      </div>
      {text && (
        <div className="text-[12px] leading-[1.55] text-muted [&_p]:m-0 [&_p+p]:mt-1.5 [&_pre]:mt-1.5 [&_pre]:overflow-auto [&_pre]:text-[10px]">
          <Streamdown>{text}</Streamdown>
        </div>
      )}
      {tools.map((tool, index) => (
        <ToolCard key={String(tool.id ?? index)} tool={tool} />
      ))}
    </article>
  );
}

function ToolCard({ tool }: { tool: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const name = String(tool.name ?? "monitor tool");
  const args = tool.arguments ?? tool.input ?? {};
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-hairline bg-black/15">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[10px] text-muted"
      >
        <Wrench size={12} className="text-tertiary" />
        <span>{name}</span>
        <ChevronDown
          size={12}
          className={cn("ml-auto text-tertiary transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <pre className="border-t border-hairline p-2 font-mono text-[10px] leading-[1.55] text-[#aeb3c3] whitespace-pre-wrap">
          {typeof args === "string" ? args : JSON.stringify(args, null, 2)}
        </pre>
      )}
    </div>
  );
}

function RunIndicator() {
  return (
    <div className="my-2.5 overflow-hidden rounded-[11px] border border-hairline bg-white/[0.025]">
      <div className="flex min-h-[35px] items-center gap-2 border-b border-hairline px-2.5 text-[11px] font-[610] text-muted">
        <Sparkles size={13} className="animate-pulse text-primary-hover" />
        <span>Investigating</span>
        <span className="ml-auto text-[10px] font-[520] text-tertiary">Running</span>
      </div>
      <div className="px-2.5 py-2 text-[11px] text-tertiary">
        Reading monitoring data for the scoped application…
      </div>
    </div>
  );
}

function SessionMenu({
  sessions,
  activeId,
  onPick,
  onNew,
  onClose,
}: {
  sessions: AgentSessionSummary[];
  activeId: string;
  onPick: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-2 left-2 top-[calc(100%+6px)] z-35 overflow-hidden rounded-[12px] border border-hairline-strong bg-[rgba(30,31,37,0.93)] shadow-[0_16px_50px_rgba(0,0,0,0.34),0_2px_12px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
        <div className="flex min-h-[34px] items-center justify-center border-b border-hairline px-2.5 text-[10px] font-[650] uppercase tracking-[0.07em] text-tertiary">
          Switch conversation
        </div>
        <div className="max-h-[232px] overflow-auto p-1">
          {sessions.length === 0 && (
            <div className="px-3 py-6 text-center text-[11px] text-tertiary">
              No conversations yet.
            </div>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s.id)}
              className={cn(
                "grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-muted transition-colors hover:bg-white/[0.065] hover:text-ink",
                s.id === activeId && "bg-primary/15 text-ink",
              )}
            >
              <MessageCircle
                size={14}
                className={cn("text-tertiary", s.id === activeId && "text-primary-hover")}
              />
              <span className="min-w-0">
                <strong className="block truncate text-[11px] font-[610]">
                  {s.title || "New conversation"}
                </strong>
              </span>
              <span className="text-[9px] text-tertiary">{relativeUpdated(s.updatedAt)}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-hairline px-2 py-1.5">
          <button
            type="button"
            onClick={onNew}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-primary-hover transition-colors hover:bg-primary/15"
          >
            <SquarePlus size={12} /> New conversation
          </button>
        </div>
      </div>
    </>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeUpdated(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.round(diff / 60000);
  if (min < 1) return "Now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

function suggestionData(context: AgentPromptInput["context"] | null, pathname: string): string[] {
  if (context?.source === "issue")
    return ["What is the likely trigger?", "Show the key evidence", "Which event pattern matters?"];
  if (
    context?.source === "metric" ||
    context?.source === "performance" ||
    pathname.startsWith("/performance")
  )
    return [
      "Which metric needs attention?",
      "Explain the p75 value",
      "Compare the collected summaries",
    ];
  return ["What needs attention?", "Summarize open issues", "What can I inspect?"];
}

interface Chip {
  key: string;
  icon: typeof Sparkles;
  text: string;
  object?: boolean;
  removable?: boolean;
}

function contextChips({
  appName,
  context,
  issueTitle,
  pathname,
}: {
  appName: string;
  context: AgentPromptInput["context"] | null;
  issueTitle?: string;
  pathname: string;
}): Chip[] {
  const chips: Chip[] = [{ key: "app", icon: AppWindow, text: appName }];
  if (context?.source === "issue" && context.issueId) {
    chips.push({
      key: "issue",
      icon: AlertTriangle,
      text: `${context.issueId} · ${issueTitle ?? "issue"}`,
      object: true,
      removable: true,
    });
  } else if (context?.source === "metric" && context.metricName) {
    chips.push({
      key: "metric",
      icon: BarChart3,
      text: `${context.metricName} · ${RANGE_LABEL[context.hours ?? 24] ?? "Last 24 hours"}`,
      object: true,
      removable: true,
    });
  } else if (context?.source === "performance") {
    chips.push({
      key: "perf",
      icon: BarChart3,
      text: `Performance · ${RANGE_LABEL[context.hours ?? 24] ?? "Last 24 hours"}`,
      object: true,
      removable: true,
    });
  } else {
    chips.push({
      key: "view",
      icon: pathname.startsWith("/performance") ? BarChart3 : AlertTriangle,
      text: pathname.startsWith("/performance") ? "Performance view" : "Issues view",
    });
  }
  return chips;
}

async function loadSession(
  sessionId: string,
  setSession: (session: AgentSessionDetail | null) => void,
  setError: (message: string) => void,
): Promise<void> {
  try {
    setSession(await window.traceability.sessions.get(sessionId));
  } catch (cause) {
    setError(toError(cause));
  }
}

function toError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
