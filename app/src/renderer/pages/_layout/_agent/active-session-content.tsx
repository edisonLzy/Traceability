import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { useCurrentApp } from "@renderer/context/current-app";
import type { AgentPromptEvent } from "@renderer/lib/agent-events";
import { agentStore } from "@renderer/store/agent";
import type { MonitoringContext } from "@shared/agent-message";
import type { AvailableModel } from "@shared/models-ipc";
import { AlertTriangle, AppWindow, BarChart3, Sparkles, SquarePlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useStore } from "zustand";

import { useAgentMessages } from "./hooks/use-agent-messages";
import { useAgentSkills } from "./hooks/use-agent-skills";
import { useAgentTokenUsage } from "./hooks/use-agent-token-usage";
import { AskUserQuestionPanel } from "./human-in-the-loop";
import { ChatMessages } from "./messages";
import { isMessageEntry } from "./messages/types";
import { PromptInput, type PromptSubmission } from "./prompt-input";
import { createTextDocument } from "./prompt-input/rich-text";
import { SessionMenu } from "./session/session-menu";
import { useAgentSession } from "./session/use-agent-session";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AgentPanel() {
  const { appId, currentApp } = useCurrentApp();
  const location = useLocation();
  const { createSession, error, refreshSessions, renameSession, selectSession } = useAgentSession(
    appId || undefined,
  );
  const { skills } = useAgentSkills();
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const sessions = useStore(agentStore, (state) => state.sessions);
  const activeSessionId = useStore(agentStore, (state) => state.activeSessionId);
  const activeSession = useStore(agentStore, (state) =>
    state.activeSessionId ? state.getSession(state.activeSessionId) : undefined,
  );
  const entryState = useStore(agentStore, (state) =>
    state.activeSessionId ? state.getEntryState(state.activeSessionId) : undefined,
  );
  const questions = useStore(agentStore, (state) =>
    state.activeSessionId ? state.getQuestions(state.activeSessionId) : [],
  );

  useAgentMessages();
  useAgentTokenUsage();

  useEffect(() => {
    let active = true;
    void window.traceability
      .invoke("getAvailableModels")
      .then((nextModels) => {
        if (active) setModels(nextModels);
      })
      .catch((cause) => {
        if (active) setPanelError(toErrorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeSession || activeSession.model || models.length === 0) return;
    agentStore.getState().setModel(activeSession.id, models[0]!);
  }, [activeSession, models]);

  const context: MonitoringContext | null =
    activeSession?.monitoringContext ?? (appId ? { appId, source: "general" } : null);
  const isRunning = entryState?.status === "running";
  const streamingEntryId = activeSessionId
    ? agentStore.getState().streamingEntryIds.get(activeSessionId)
    : undefined;

  const submit = useCallback(
    async (submission: PromptSubmission, contextOverride?: MonitoringContext) => {
      let sessionId = agentStore.getState().activeSessionId;
      let session = sessionId ? agentStore.getState().getSession(sessionId) : undefined;
      if (!session || session.appId !== appId) {
        const created = await createSession();
        sessionId = created?.id ?? null;
        session = sessionId ? agentStore.getState().getSession(sessionId) : undefined;
      }
      if (!sessionId || !session || !appId) return;

      const monitoringContext = contextOverride ??
        session.monitoringContext ?? { appId, source: "general" };
      if (monitoringContext.appId !== appId) {
        setPanelError("The selected context belongs to a different application.");
        return;
      }
      agentStore.getState().setMonitoringContext(sessionId, monitoringContext);

      const hasMessages = agentStore
        .getState()
        .getEntryState(sessionId)
        .entries.some(isMessageEntry);
      if (!hasMessages && !session.name) {
        const name = submission.content.replaceAll(/\s+/g, " ").trim().slice(0, 80);
        if (name) void renameSession(sessionId, name);
      }

      const message: AppUserMessage = {
        role: "user",
        content: submission.content,
        timestamp: Date.now(),
        kind: "prompt",
        jsonContent: submission.jsonContent,
        metadata: {
          model: { providerId: submission.model.providerId, modelId: submission.model.modelId },
          monitoringContext,
          skillIds: submission.skillIds,
        },
      };

      try {
        setPanelError(null);
        agentStore.getState().setSessionStatus(sessionId, "running");
        agentStore.getState().setModel(sessionId, submission.model);
        const modelApplied = await window.traceability.invoke(
          "setModel",
          sessionId,
          submission.model,
        );
        if (!modelApplied) throw new Error("The selected model is unavailable.");
        await window.traceability.invoke("prompt", sessionId, message);
      } catch (cause) {
        agentStore.getState().setSessionStatus(sessionId, "idle");
        setPanelError(toErrorMessage(cause));
      }
    },
    [appId, createSession, renameSession],
  );

  useEffect(() => {
    const onPrompt = (event: Event) => {
      const detail = (event as CustomEvent<AgentPromptEvent>).detail;
      if (!detail || detail.context.appId !== appId) return;
      const model = activeSession?.appId === appId ? (activeSession.model ?? models[0]) : models[0];
      if (!model) {
        setPanelError("No compatible model is configured.");
        return;
      }
      if (activeSessionId && activeSession?.appId === appId)
        agentStore.getState().setMonitoringContext(activeSessionId, detail.context);
      void submit(
        {
          content: detail.prompt,
          jsonContent: createTextDocument(detail.prompt),
          model,
          skillIds: [],
        },
        detail.context,
      );
    };
    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<MonitoringContext>).detail;
      if (!detail || detail.appId !== appId || !activeSessionId || activeSession?.appId !== appId)
        return;
      agentStore.getState().setMonitoringContext(activeSessionId, detail);
    };
    const onNew = () => void createSession();
    const onSessionUpdated = () => void refreshSessions();
    const onSelect = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId: string }>).detail;
      if (detail?.sessionId) void selectSession(detail.sessionId);
    };

    window.addEventListener("traceability:agent-prompt", onPrompt);
    window.addEventListener("traceability:agent-context", onContext);
    window.addEventListener("traceability:agent-new-session", onNew);
    window.addEventListener("traceability:agent-session-updated", onSessionUpdated);
    window.addEventListener("traceability:agent-select-session", onSelect);
    return () => {
      window.removeEventListener("traceability:agent-prompt", onPrompt);
      window.removeEventListener("traceability:agent-context", onContext);
      window.removeEventListener("traceability:agent-new-session", onNew);
      window.removeEventListener("traceability:agent-session-updated", onSessionUpdated);
      window.removeEventListener("traceability:agent-select-session", onSelect);
    };
  }, [
    activeSession?.model,
    activeSessionId,
    appId,
    createSession,
    models,
    refreshSessions,
    selectSession,
    submit,
  ]);

  const changeModel = async (model: AvailableModel | null) => {
    if (!activeSessionId || !model || activeSession?.appId !== appId) return;
    const previous = agentStore.getState().getSession(activeSessionId)?.model ?? null;
    agentStore.getState().setModel(activeSessionId, model);
    try {
      const modelApplied = await window.traceability.invoke("setModel", activeSessionId, model);
      if (!modelApplied) throw new Error("The selected model is unavailable.");
    } catch (cause) {
      agentStore.getState().setModel(activeSessionId, previous);
      setPanelError(toErrorMessage(cause));
    }
  };

  const clearContext = () => {
    if (activeSessionId && appId) {
      agentStore.getState().setMonitoringContext(activeSessionId, { appId, source: "general" });
    }
  };

  return (
    <aside
      aria-label="Traceability Agent"
      className="relative flex min-w-0 flex-col border-l border-hairline bg-[rgba(18,19,23,0.75)] pt-[30px] backdrop-blur-2xl"
    >
      <Resizer />
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
            {activeSession?.name || "New conversation"}
          </strong>
          <small className="mt-0.5 flex items-center gap-1.5 text-[10px] text-tertiary">
            <span>{isRunning ? "Investigating" : "Traceability Agent"}</span>
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
        {menuOpen && (
          <SessionMenu
            activeSessionId={activeSessionId}
            onClose={() => setMenuOpen(false)}
            onCreate={() => void createSession()}
            onSelect={(sessionId) => void selectSession(sessionId)}
            sessions={sessions}
          />
        )}
      </header>

      <section className="border-b border-hairline bg-black/10 px-2.5 py-2">
        <div className="mb-1 flex items-center justify-between text-[10px] font-[660] uppercase tracking-[0.08em] text-tertiary">
          <span>Context</span>
          <span>{context?.source === "general" ? "Automatic" : "Pinned"}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ContextChip icon={AppWindow} text={currentApp?.name ?? appId ?? "No application"} />
          {context && context.source !== "general" ? (
            <ContextChip
              icon={context.source === "issue" ? AlertTriangle : BarChart3}
              onRemove={clearContext}
              text={contextLabel(context)}
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
        <ChatMessages entries={entryState?.entries ?? []} streamingEntryId={streamingEntryId} />
      </section>

      <section className="shrink-0 border-t border-hairline bg-[rgba(14,15,18,0.86)] px-2.5 py-2.5">
        {questions[0] && activeSessionId ? (
          <AskUserQuestionPanel request={questions[0]} sessionId={activeSessionId} />
        ) : (
          <PromptInput
            disabled={!activeSessionId || !appId}
            isRunning={Boolean(isRunning)}
            model={activeSession?.model ?? null}
            models={models}
            onModelChange={(model) => void changeModel(model)}
            onStop={() => {
              if (activeSessionId && activeSession?.appId === appId)
                void window.traceability.invoke("abortPrompt", activeSessionId);
            }}
            onSubmit={submit}
            skills={skills}
          />
        )}
        {(error || panelError) && (
          <p className="mt-1.5 text-[10px] text-danger">{panelError ?? error}</p>
        )}
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
      {onRemove && (
        <button
          className="grid size-3.5 place-items-center rounded hover:bg-white/15"
          onClick={onRemove}
          title="Clear context"
          type="button"
        >
          <X size={10} />
        </button>
      )}
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

function Resizer() {
  return (
    <div
      aria-hidden="true"
      className="group absolute -left-[5px] top-[30px] bottom-0 z-10 w-2.5 cursor-col-resize"
      onPointerDown={(event) => {
        event.preventDefault();
        const move = (pointerEvent: PointerEvent) => {
          const width = Math.max(320, Math.min(560, window.innerWidth - pointerEvent.clientX));
          document.documentElement.style.setProperty("--agent-width", `${width}px`);
        };
        const up = () => {
          document.removeEventListener("pointermove", move);
          document.removeEventListener("pointerup", up);
        };
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", up);
      }}
    >
      <span className="absolute left-[3px] top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}
