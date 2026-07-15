import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { agentStore } from "@renderer/store/agent";
import type { Session } from "@renderer/store/agent";
import { useState } from "react";

import { PanelBody, PanelFooter, PanelHeader, PanelLayout } from "./components/panel-layout";
import { PromptInput } from "./prompt-input";
import type { PromptSubmission } from "./prompt-types";
import { createSessionTitleFromPrompt } from "./session-title";

/** Shown when there is no active session. Creates a session on first prompt submission. */
export function PendingSessionContent() {
  const { invoke } = useElectronIPC();
  const [isLoading, setIsLoading] = useState(false);

  const submitPrompt = async (submission: PromptSubmission) => {
    if (isLoading) return;
    setIsLoading(true);

    let session: Session | null = null;
    try {
      session = await invoke("createSession", "traceability");
      agentStore.getState().appendSession(session);

      // Auto-rename: derive title from first prompt
      const title = createSessionTitleFromPrompt(submission.content);
      if (title) {
        agentStore.getState().setSessionName(session.id, title);
        try {
          await invoke("renameSession", session.id, title);
        } catch {
          // Non-critical — ignore rename failures
        }
      }

      // Register the session with the main process
      await invoke("setSessionId", session.id);
      await invoke("setSessionScope", session.id, "main");

      // Set active session — this triggers React to swap to ActiveSessionContent
      agentStore.getState().setActiveSessionId(session.id);

      // Begin the agent run
      agentStore.getState().setSessionStatus(session.id, "running");
      agentStore.getState().setModel(session.id, submission.model);

      const appUserMessage: AppUserMessage = {
        role: "user",
        content: submission.content,
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

      await invoke("prompt", session.id, appUserMessage);
    } catch (error) {
      console.error("Failed to create session and submit prompt", error);
      if (session?.id) {
        agentStore.getState().setSessionStatus(session.id, "idle");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PanelLayout>
      <PanelHeader title="New conversation" />
      <PanelBody className="flex items-center justify-center">
        <div className="mx-auto max-w-[280px] text-center">
          <h2 className="text-[13px] font-[570] leading-snug text-muted">
            What should I help you with?
          </h2>
        </div>
      </PanelBody>
      <PanelFooter>
        <PromptInput
          disabled={isLoading}
          initialModel={null}
          isRunning={false}
          onSubmit={submitPrompt}
          sessionId={null}
        />
      </PanelFooter>
    </PanelLayout>
  );
}
