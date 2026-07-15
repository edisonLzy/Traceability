import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { agentStore } from "@renderer/store/agent";
import { SquarePlus } from "lucide-react";
import { useCallback } from "react";
import { useStore } from "zustand";

import { PanelBody, PanelFooter, PanelHeader, PanelLayout } from "./components/panel-layout";
import { useAgentMessages } from "./hooks/use-agent-messages";
import { useAgentTokenUsage } from "./hooks/use-agent-token-usage";
import { AskUserQuestionPanel } from "./human-in-the-loop";
import { ChatMessages } from "./messages";
import { isMessageEntry, isUserMessage } from "./messages/types";
import { PendingMessages } from "./pending-messages";
import { PromptInput, type PromptInputProps } from "./prompt-input";
import type { PromptSubmission } from "./prompt-types";
import { createSessionTitleFromPrompt, shouldAutoRenameSession } from "./session-title";

/** Full chat UI for an active session. */
export function ActiveSessionContent({ sessionId }: { sessionId: string }) {
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
  } = useActiveSessionChat(sessionId);

  const activeSession = useStore(agentStore, (state) => state.getSession(sessionId));
  const pendingHumanInTheLoopRequest = useStore(
    agentStore,
    (state) => state.getHumanInTheLoopState(sessionId).requests[0] ?? null,
  );
  const sessionName = activeSession?.name.trim() || "untitled";

  useAgentMessages();
  useAgentTokenUsage();

  const handlePromptInputCreated: PromptInputProps["onCreate"] = () => {};
  const handlePromptInputDestroyed: PromptInputProps["onDestroy"] = () => {};

  return (
    <PanelLayout>
      <PanelHeader title={sessionName} actions={<CreateSessionButton />} />

      <PanelBody className="overflow-hidden">
        <ChatMessages
          entries={entries}
          isRunning={isRunning}
          messageEntries={messageEntries}
          sessionId={sessionId}
          streamingEntryId={streamingEntryId}
          toolStates={toolStates}
        />
      </PanelBody>

      <PanelFooter>
        <PendingMessages sessionId={sessionId} />
        <div className="mt-2">
          {pendingHumanInTheLoopRequest ? (
            <AskUserQuestionPanel request={pendingHumanInTheLoopRequest} sessionId={sessionId} />
          ) : (
            <PromptInput
              disabled={false}
              initialModel={activeSession?.model ?? null}
              isRunning={isRunning}
              onFollowUp={followUpPrompt}
              onSteer={steerPrompt}
              onStop={stopPrompt}
              onSubmit={submitPrompt}
              sessionId={sessionId}
              onCreate={handlePromptInputCreated}
              onDestroy={handlePromptInputDestroyed}
              tokenUsage={tokenUsage}
            />
          )}
        </div>
      </PanelFooter>
    </PanelLayout>
  );
}

// ─── CreateSessionButton ─────────────────────────────────────────────

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

// ─── useActiveSessionChat ────────────────────────────────────────────

function useActiveSessionChat(activeSessionId: string) {
  const { invoke } = useElectronIPC();
  const activeSession = useStore(agentStore, (state) => state.getSession(activeSessionId));
  const entryState = useStore(agentStore, (state) => state.getEntryState(activeSessionId));
  const streamingEntryId = useStore(agentStore, (state) =>
    state.streamingEntryIds.get(activeSessionId),
  );
  const entries = entryState.entries;
  const messageEntries = entries.filter(isMessageEntry);
  const toolStates = entryState.toolStates;
  const isRunning = entryState.status === "running";
  const tokenUsage = messageEntries.findLast((entry) => entry.tokenUsage)?.tokenUsage ?? undefined;

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
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
    streamingEntryId,
    stopPrompt,
    toolStates,
    submitPrompt,
    steerPrompt,
    followUpPrompt,
    tokenUsage,
  };
}
