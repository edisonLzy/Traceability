import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { agentStore, type MonitoringContext } from "@renderer/store/agent";
import type { AvailableModel } from "@shared/models-ipc";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";

import { isMessageEntry } from "../messages/types";
import { createTextDocument } from "../prompt-input/rich-text";
import type { PromptSubmission } from "../prompt-types";
import { createSessionTitleFromPrompt, shouldAutoRenameSession } from "../session-title";
import { createAppUserMessage } from "../use-chat-utils";

interface UseActiveSessionChatOptions {
  appId: string | undefined;
  createSession: () => Promise<{ id: string } | null>;
  renameSession: (id: string, name: string) => Promise<void>;
  setPanelError: (error: string | null) => void;
}

export function useActiveSessionChat({
  appId,
  createSession,
  renameSession,
  setPanelError,
}: UseActiveSessionChatOptions) {
  const { invoke } = useElectronIPC();

  const [models, setModels] = useState<AvailableModel[]>([]);

  const activeSessionId = useStore(agentStore, (state) => state.activeSessionId);
  const activeSession = useStore(agentStore, (state) =>
    state.activeSessionId ? state.getSession(state.activeSessionId) : undefined,
  );
  const entryState = useStore(agentStore, (state) =>
    state.activeSessionId ? state.getEntryState(state.activeSessionId) : undefined,
  );
  const pendingQuestion = useStore(agentStore, (state) =>
    state.activeSessionId
      ? state.getHumanInTheLoopState(state.activeSessionId).requests[0]
      : undefined,
  );

  useEffect(() => {
    let active = true;
    void invoke("getAvailableModels")
      .then((nextModels) => {
        if (active) setModels(nextModels);
      })
      .catch((cause) => {
        if (active) setPanelError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
    };
  }, [invoke, setPanelError]);

  useEffect(() => {
    if (!activeSession || activeSession.model || models.length === 0) return;
    agentStore.getState().setModel(activeSession.id, models[0]!);
  }, [activeSession, models]);

  const context: MonitoringContext | null = useMemo(() => {
    if (activeSession?.monitoringContext) return activeSession.monitoringContext;
    return appId ? { appId, source: "general" as const } : null;
  }, [activeSession?.monitoringContext, appId]);

  const isRunning = entryState?.status === "running";
  const streamingEntryId = activeSessionId
    ? agentStore.getState().streamingEntryIds.get(activeSessionId)
    : undefined;

  const send = useCallback(
    async (
      submission: PromptSubmission,
      kind: AppUserMessage["kind"] = "prompt",
      contextOverride?: MonitoringContext,
    ) => {
      let sessionId = agentStore.getState().activeSessionId;
      let session = sessionId ? agentStore.getState().getSession(sessionId) : undefined;
      if (!session || session.appId !== appId) {
        const created = await createSession();
        sessionId = created?.id ?? null;
        session = sessionId ? agentStore.getState().getSession(sessionId) : undefined;
      }
      if (!sessionId || !session || !appId) return;

      const monitoringContext = contextOverride ??
        session.monitoringContext ?? {
          appId,
          source: "general" as const,
        };
      if (monitoringContext.appId !== appId) {
        setPanelError("The selected context belongs to a different application.");
        return;
      }
      agentStore.getState().setMonitoringContext(sessionId, monitoringContext);

      const hasMessages = agentStore
        .getState()
        .getEntryState(sessionId)
        .entries.some(isMessageEntry);
      if (kind === "prompt" && !hasMessages && shouldAutoRenameSession(session.name)) {
        const title = createSessionTitleFromPrompt(submission.content);
        if (title) void renameSession(sessionId, title);
      }

      const message = createAppUserMessage(submission, kind, monitoringContext);
      try {
        setPanelError(null);
        if (kind === "prompt") agentStore.getState().setSessionStatus(sessionId, "running");
        agentStore.getState().setModel(sessionId, submission.model);
        if (kind !== "prompt") agentStore.getState().addPendingMessage(sessionId, message);
        await invoke("prompt", sessionId, message);
      } catch (cause) {
        if (kind === "prompt") agentStore.getState().setSessionStatus(sessionId, "idle");
        else agentStore.getState().removePendingMessageByTimestamp(sessionId, message.timestamp);
        setPanelError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [appId, createSession, invoke, renameSession, setPanelError],
  );

  const submitPrompt = useCallback(
    (submission: PromptSubmission, contextOverride?: MonitoringContext) =>
      send(submission, "prompt", contextOverride),
    [send],
  );
  const steerPrompt = useCallback(
    (submission: PromptSubmission) => send(submission, "steering"),
    [send],
  );
  const followUpPrompt = useCallback(
    (submission: PromptSubmission) => send(submission, "follow-up"),
    [send],
  );

  const changeModel = async (model: AvailableModel | null) => {
    const sessionId = agentStore.getState().activeSessionId;
    if (!sessionId || !model || activeSession?.appId !== appId) return;
    const previous = agentStore.getState().getSession(sessionId)?.model ?? null;
    agentStore.getState().setModel(sessionId, model);
    try {
      const applied = await invoke("setModel", sessionId, model);
      if (!applied) throw new Error("The selected model is unavailable.");
    } catch (cause) {
      agentStore.getState().setModel(sessionId, previous);
      setPanelError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const clearContext = () => {
    const sessionId = agentStore.getState().activeSessionId;
    if (sessionId && appId) {
      agentStore.getState().setMonitoringContext(sessionId, { appId, source: "general" as const });
    }
  };

  const stopPrompt = useCallback(() => {
    const sessionId = agentStore.getState().activeSessionId;
    if (sessionId) void invoke("abortPrompt", sessionId);
  }, [invoke]);

  return {
    activeSessionId,
    activeSession,
    models,
    entryState,
    pendingQuestion,
    context,
    isRunning,
    streamingEntryId,
    submitPrompt,
    steerPrompt,
    followUpPrompt,
    changeModel,
    clearContext,
    stopPrompt,
  };
}
