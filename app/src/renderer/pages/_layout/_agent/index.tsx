import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { agentStore } from "@renderer/store/agent";
import type { ToolExecutionState } from "@renderer/store/agent";
import { Sparkles, SquarePlus } from "lucide-react";
import { useCallback } from "react";
import { useStore } from "zustand";

import { useAgentMessages } from "./hooks/use-agent-messages";
import { useAgentTokenUsage } from "./hooks/use-agent-token-usage";
import { AskUserQuestionPanel } from "./human-in-the-loop";
import { ChatMessages } from "./messages";
import { isMessageEntry, isUserMessage } from "./messages/types";
import { PendingMessages } from "./pending-messages";
import { PromptInput, type PromptInputProps } from "./prompt-input";
import type { PromptSubmission } from "./prompt-types";
import { createSessionTitleFromPrompt, shouldAutoRenameSession } from "./session-title";

const EMPTY_TOOL_STATES = new Map<string, ToolExecutionState>();

export function AgentPanel() {
  const {
    entries,
    isRunning,
    messageEntries,
    streamingEntryId,
    stopPrompt,
    toolStates,
    submitPrompt,
    steerPrompt,
    followUpPrompt,
    tokenUsage,
  } = useActiveSessionChat();

  const activeSessionId = useStore(agentStore, (state) => state.activeSessionId!);
  const activeSession = useStore(agentStore, (state) =>
    activeSessionId ? state.getSession(activeSessionId) : undefined,
  );
  const pendingHumanInTheLoopRequest = useStore(agentStore, (state) => {
    if (!activeSessionId) {
      return null;
    }
    return state.getHumanInTheLoopState(activeSessionId).requests[0] ?? null;
  });
  const sessionName = activeSession?.name.trim() || "untitled";

  useAgentMessages();
  useAgentTokenUsage();

  const handlePromptInputCreated: PromptInputProps["onCreate"] = () => {};
  const handlePromptInputDestroyed: PromptInputProps["onDestroy"] = () => {};

  return (
    <aside
      aria-label="Traceability Agent"
      className="relative flex h-full min-w-0 flex-col bg-[rgba(18,19,23,0.75)] backdrop-blur-2xl"
    >
      <header className="relative flex min-h-12 items-center gap-2 border-b border-hairline px-2.5">
        <span className="grid size-[27px] place-items-center rounded-[9px] bg-primary/15 text-primary-hover">
          <Sparkles size={15} />
        </span>
        <h1 className="min-w-0 flex-1 truncate px-1.5 text-[12px] font-[650] text-ink">
          {sessionName}
        </h1>
        <CreateSessionButton />
      </header>

      <section className="min-h-0 flex-1 overflow-hidden">
        <ChatMessages
          entries={entries}
          isRunning={isRunning}
          messageEntries={messageEntries}
          sessionId={activeSessionId ?? ""}
          streamingEntryId={streamingEntryId}
          toolStates={toolStates}
        />
      </section>

      <section className="shrink-0 border-t border-hairline bg-[rgba(14,15,18,0.86)] px-2.5 py-2.5">
        {activeSessionId ? <PendingMessages sessionId={activeSessionId} /> : null}
        <div className={activeSessionId ? "mt-2" : ""}>
          {activeSessionId && pendingHumanInTheLoopRequest ? (
            <AskUserQuestionPanel
              request={pendingHumanInTheLoopRequest}
              sessionId={activeSessionId}
            />
          ) : (
            <PromptInput
              disabled={false}
              initialModel={activeSession?.model ?? null}
              isRunning={isRunning}
              onFollowUp={followUpPrompt}
              onSteer={steerPrompt}
              onStop={stopPrompt}
              onSubmit={submitPrompt}
              sessionId={activeSessionId}
              onCreate={handlePromptInputCreated}
              onDestroy={handlePromptInputDestroyed}
              tokenUsage={tokenUsage}
            />
          )}
        </div>
      </section>
    </aside>
  );
}

// ─── CreateSessionButton ─────────────────────────────────────────

function CreateSessionButton() {
  const { invoke } = useElectronIPC();

  const handleClick = useCallback(async () => {
    try {
      const session = await invoke("createSession", "traceability");
      agentStore.getState().appendSession(session);
      agentStore.getState().setActiveSessionId(session.id);
      await invoke("setSessionId", session.id);
      await invoke("setSessionScope", session.id, "main");
    } catch (error) {
      console.error("Failed to create session", error);
    }
  }, [invoke]);

  return (
    <button
      className="grid size-[27px] place-items-center rounded-[7px] text-tertiary transition-colors hover:bg-white/10 hover:text-ink"
      onClick={handleClick}
      title="New conversation"
      type="button"
    >
      <SquarePlus size={16} />
    </button>
  );
}

// ─── useActiveSessionChat (inline hook) ──────────────────────────

function useActiveSessionChat() {
  const { invoke } = useElectronIPC();
  const activeSessionId = useStore(agentStore, (state) => state.activeSessionId!);
  const activeSession = activeSessionId ? agentStore.getState().getSession(activeSessionId) : null;
  const entryState = activeSessionId
    ? agentStore.getState().getEntryState(activeSessionId)
    : { entries: [], toolStates: EMPTY_TOOL_STATES, status: "idle" as const };
  const entries = entryState.entries;
  const messageEntries = entries.filter(isMessageEntry);
  const toolStates = entryState.toolStates;
  const isRunning = entryState.status === "running";
  const tokenUsage = messageEntries.findLast((entry) => entry.tokenUsage)?.tokenUsage ?? undefined;

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId) return;

      agentStore.getState().setSessionStatus(activeSessionId, "running");
      agentStore.getState().setModel(activeSessionId, submission.model);
      const submissionText = submission.content;
      const shouldRename =
        shouldAutoRenameSession(activeSession?.name) &&
        !entries.some((entry) => isMessageEntry(entry) && isUserMessage(entry.data));

      if (shouldRename) {
        const title = createSessionTitleFromPrompt(submissionText);
        agentStore.getState().setSessionName(activeSessionId, title);
        try {
          await invoke("renameSession", activeSessionId, title);
        } catch (error) {
          console.error("Failed to rename session", error);
        }
      }

      try {
        const appUserMessage: AppUserMessage = {
          role: "user",
          content: submissionText,
          timestamp: Date.now(),
          kind: "prompt",
          jsonContent: submission.jsonContent,
          metadata: {
            model: {
              modelId: submission.model.modelId,
              providerId: submission.model.providerId,
            },
            skillIds: submission.skillIds,
          },
        };
        await invoke("prompt", activeSessionId, appUserMessage);
      } catch (error) {
        console.error("Failed to submit prompt", error);
        agentStore.getState().setSessionStatus(activeSessionId, "idle");
      }
    },
    [activeSession?.name, activeSessionId, entries, invoke],
  );

  const steerPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId) return;

      const timestamp = Date.now();
      try {
        const appUserMessage: AppUserMessage = {
          role: "user",
          content: submission.content,
          timestamp,
          kind: "steering",
          jsonContent: submission.jsonContent,
          metadata: {
            model: {
              modelId: submission.model.modelId,
              providerId: submission.model.providerId,
            },
            skillIds: submission.skillIds,
          },
        };
        agentStore.getState().addPendingMessage(activeSessionId, appUserMessage);
        await invoke("prompt", activeSessionId, appUserMessage);
      } catch (error) {
        console.error("Failed to steer prompt", error);
        agentStore.getState().removePendingMessageByTimestamp(activeSessionId, timestamp);
      }
    },
    [activeSessionId, invoke],
  );

  const followUpPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId) return;

      const timestamp = Date.now();
      try {
        const appUserMessage: AppUserMessage = {
          role: "user",
          content: submission.content,
          timestamp,
          kind: "follow-up",
          jsonContent: submission.jsonContent,
          metadata: {
            model: {
              modelId: submission.model.modelId,
              providerId: submission.model.providerId,
            },
            skillIds: submission.skillIds,
          },
        };
        agentStore.getState().addPendingMessage(activeSessionId, appUserMessage);
        await invoke("prompt", activeSessionId, appUserMessage);
      } catch (error) {
        console.error("Failed to queue follow-up prompt", error);
        agentStore.getState().removePendingMessageByTimestamp(activeSessionId, timestamp);
      }
    },
    [activeSessionId, invoke],
  );

  const stopPrompt = useCallback(async () => {
    if (!activeSessionId) return;

    try {
      await invoke("abortPrompt", activeSessionId);
    } catch (error) {
      console.error("Failed to stop prompt", error);
    }
  }, [activeSessionId, invoke]);

  return {
    entries,
    isRunning,
    messageEntries,
    streamingEntryId: activeSessionId
      ? agentStore.getState().streamingEntryIds.get(activeSessionId)
      : undefined,
    stopPrompt,
    toolStates,
    submitPrompt,
    steerPrompt,
    followUpPrompt,
    tokenUsage,
  };
}
