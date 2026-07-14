import "@shared/agent-message";
import { useCurrentApp } from "@renderer/context/current-app";
import { agentStore, type MonitoringContext } from "@renderer/store/agent";
import { AlertTriangle, AppWindow, BarChart3, Sparkles, SquarePlus, X } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useStore } from "zustand";

import { useActiveSessionChat } from "./hooks/use-active-session-chat";
import { useAgentExternalEvents } from "./hooks/use-agent-external-events";
import { useAgentMessages } from "./hooks/use-agent-messages";
import { useAgentTokenUsage } from "./hooks/use-agent-token-usage";
import { AskUserQuestionPanel } from "./human-in-the-loop";
import { ChatMessages } from "./messages";
import { PendingMessages } from "./pending-messages";
import { PromptInput } from "./prompt-input";
import { SessionMenu } from "./session/session-menu";
import { useAgentSession } from "./session/use-agent-session";

export function AgentPanel() {
  const { appId, currentApp } = useCurrentApp();
  const location = useLocation();
  const {
    createSession,
    error: sessionError,
    refreshSessions,
    renameSession,
    selectSession,
  } = useAgentSession(appId || undefined);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const chat = useActiveSessionChat({ appId, createSession, renameSession, setPanelError });
  useAgentExternalEvents({
    activeSessionId: chat.activeSessionId,
    activeSession: chat.activeSession,
    submitPrompt: chat.submitPrompt,
    createSession,
    refreshSessions,
    selectSession,
    setPanelError,
  });
  useAgentMessages();
  useAgentTokenUsage();

  const sessions = useStore(agentStore, (state) => state.sessions);

  return (
    <aside
      aria-label="Traceability Agent"
      className="relative flex h-full min-w-0 flex-col bg-[rgba(18,19,23,0.75)] backdrop-blur-2xl"
    >
      <header className="relative flex min-h-12 items-center gap-2 border-b border-hairline px-2.5">
        <span className="grid size-[27px] place-items-center rounded-[9px] bg-primary/15 text-primary-hover">
          <Sparkles size={15} />
        </span>
        <button
          className="min-w-0 flex-1 rounded-[7px] px-1.5 py-1 text-left transition-colors hover:bg-white/[0.06]"
          onClick={() => setMenuOpen((open) => !open)}
          title="Switch conversation"
          type="button"
        >
          <strong className="block truncate text-[12px] font-[650] text-ink">
            {chat.activeSession?.name || "New conversation"}
          </strong>
          <small className="mt-0.5 flex items-center gap-1.5 text-[10px] text-tertiary">
            <span>{chat.isRunning ? "Investigating" : "Traceability Agent"}</span>
            <span className="font-mono">⌘G</span>
          </small>
        </button>
        <button
          className="grid size-[27px] place-items-center rounded-[7px] text-tertiary transition-colors hover:bg-white/10 hover:text-ink"
          onClick={() => void createSession()}
          title="New conversation"
          type="button"
        >
          <SquarePlus size={16} />
        </button>
        {menuOpen ? (
          <SessionMenu
            activeSessionId={chat.activeSessionId}
            onClose={() => setMenuOpen(false)}
            onCreate={() => void createSession()}
            onSelect={(sessionId) => void selectSession(sessionId)}
            sessions={sessions}
          />
        ) : null}
      </header>

      <section className="border-b border-hairline bg-black/10 px-2.5 py-2">
        <div className="mb-1 flex items-center justify-between text-[10px] font-[660] uppercase tracking-[0.08em] text-tertiary">
          <span>Context</span>
          <span>{chat.context?.source === "general" ? "Automatic" : "Pinned"}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ContextChip icon={AppWindow} text={currentApp?.name ?? appId ?? "No application"} />
          {chat.context && chat.context.source !== "general" ? (
            <ContextChip
              icon={chat.context.source === "issue" ? AlertTriangle : BarChart3}
              onRemove={chat.clearContext}
              text={contextLabel(chat.context)}
            />
          ) : (
            <ContextChip
              icon={location.pathname.startsWith("/performance") ? BarChart3 : AlertTriangle}
              text={
                location.pathname.startsWith("/performance") ? "Performance view" : "Issues view"
              }
            />
          )}
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-hidden">
        <ChatMessages
          entries={chat.entryState?.entries ?? []}
          streamingEntryId={chat.streamingEntryId}
          toolStates={chat.entryState?.toolStates ?? new Map()}
          sessionId={chat.activeSessionId ?? ""}
        />
      </section>

      <section className="shrink-0 border-t border-hairline bg-[rgba(14,15,18,0.86)] px-2.5 py-2.5">
        {chat.activeSessionId ? <PendingMessages sessionId={chat.activeSessionId} /> : null}
        <div className={chat.activeSessionId ? "mt-2" : ""}>
          {chat.pendingQuestion && chat.activeSessionId ? (
            <AskUserQuestionPanel request={chat.pendingQuestion} sessionId={chat.activeSessionId} />
          ) : (
            <PromptInput
              disabled={!chat.activeSessionId || !appId}
              isRunning={Boolean(chat.isRunning)}
              model={chat.activeSession?.model ?? null}
              models={chat.models}
              onFollowUp={chat.followUpPrompt}
              onModelChange={(model) => void chat.changeModel(model)}
              onSteer={chat.steerPrompt}
              onStop={chat.stopPrompt}
              onSubmit={chat.submitPrompt}
            />
          )}
        </div>
        {sessionError || panelError ? (
          <p className="mt-1.5 text-[10px] text-danger">{panelError ?? sessionError}</p>
        ) : null}
        <p className="mt-1.5 px-0.5 text-[10px] leading-[1.35] text-tertiary">
          Read-only access to monitoring data. The agent cannot change code or application settings.
        </p>
      </section>
    </aside>
  );
}

function ContextChip({
  icon: Icon,
  onRemove,
  text,
}: {
  icon: typeof AppWindow;
  onRemove?: () => void;
  text: string;
}) {
  return (
    <span className="inline-flex h-[23px] max-w-full items-center gap-1.5 rounded-full border border-hairline bg-white/[0.035] px-2 text-[10px] text-muted">
      <Icon className="text-tertiary" size={12} />
      <span className="truncate">{text}</span>
      {onRemove ? (
        <button
          className="grid size-3.5 place-items-center rounded hover:bg-white/15"
          onClick={onRemove}
          title="Clear context"
          type="button"
        >
          <X size={10} />
        </button>
      ) : null}
    </span>
  );
}

function contextLabel(context: MonitoringContext): string {
  if (context.source === "issue") return `Issue · ${context.issueId ?? "selected"}`;
  if (context.source === "metric")
    return `${context.metricName ?? "Metric"} · ${rangeLabel(context.hours)}`;
  return `Performance · ${rangeLabel(context.hours)}`;
}

function rangeLabel(hours: MonitoringContext["hours"]): string {
  if (hours === 1) return "Last hour";
  if (hours === 168) return "Last 7 days";
  return "Last 24 hours";
}
