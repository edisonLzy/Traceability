import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { agentStore, EntryStatus, type AgentSession } from "@renderer/store/agent";
import type { Session } from "@shared/session-ipc";
import { useCallback, useEffect, useRef, useState } from "react";

import { getSelectedModel, isMessageEntry, toSessionEntry } from "../messages/types";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Owns app-scoped session listing, selection, runtime hydration, and creation. */
export function useAgentSession(appId: string | undefined) {
  const activationVersionRef = useRef(0);
  const [error, setError] = useState<string | null>(null);

  const activateSession = useCallback(
    async (session: Session): Promise<boolean> => {
      if (!appId || session.appId !== appId) {
        setError("This conversation belongs to a different application.");
        return false;
      }

      const activationVersion = ++activationVersionRef.current;
      setError(null);

      try {
        const entries = await window.traceability.invoke("sessions:getEntries", session.id);
        if (activationVersion !== activationVersionRef.current) return false;

        const sessionEntries = entries.map(toSessionEntry);
        const existingEntries = agentStore.getState().getEntryState(session.id).entries;
        const persistedIds = new Set(sessionEntries.map((entry) => entry.id));
        const unsyncedEntries = existingEntries.filter(
          (entry) => entry.status !== EntryStatus.Synced && !persistedIds.has(entry.id),
        );
        const hydratedEntries = [...sessionEntries, ...unsyncedEntries];
        agentStore.getState().setSessionEntries(session.id, hydratedEntries);

        await window.traceability.invoke("setSessionId", session.id, appId);
        await window.traceability.invoke("setSessionScope", session.id, "main");
        await window.traceability.invoke(
          "setHistoryMessages",
          session.id,
          hydratedEntries.filter(isMessageEntry).map((entry) => entry.data) as AgentMessage[],
        );
        if (activationVersion !== activationVersionRef.current) return false;

        const selectedModel = getSelectedModel(hydratedEntries);
        if (selectedModel) agentStore.getState().setModel(session.id, selectedModel);
        agentStore.getState().setActiveSessionId(session.id);
        return true;
      } catch (cause) {
        if (activationVersion === activationVersionRef.current) setError(toErrorMessage(cause));
        return false;
      }
    },
    [appId],
  );

  const selectSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      const known = agentStore.getState().getSession(sessionId);
      const session = known ?? (await window.traceability.invoke("sessions:get", sessionId));
      if (!session) {
        setError("Conversation not found.");
        return false;
      }
      return activateSession(session);
    },
    [activateSession],
  );

  const createSession = useCallback(async (): Promise<AgentSession | null> => {
    if (!appId) return null;

    try {
      setError(null);
      const session = await window.traceability.invoke("sessions:create", appId);
      agentStore.getState().appendSession(session);
      const activated = await activateSession(session);
      return activated ? (agentStore.getState().getSession(session.id) ?? null) : null;
    } catch (cause) {
      setError(toErrorMessage(cause));
      return null;
    }
  }, [activateSession, appId]);

  const refreshSessions = useCallback(async (): Promise<Session[]> => {
    if (!appId) {
      agentStore.getState().setSessions([]);
      return [];
    }

    const sessions = await window.traceability.invoke("sessions:list", appId);
    agentStore.getState().setSessions(sessions);
    return sessions;
  }, [appId]);

  const renameSession = useCallback(async (sessionId: string, name: string): Promise<void> => {
    const previous = agentStore.getState().getSession(sessionId)?.name ?? "";
    agentStore.getState().setSessionName(sessionId, name);
    try {
      await window.traceability.invoke("sessions:rename", sessionId, name);
    } catch (cause) {
      agentStore.getState().setSessionName(sessionId, previous);
      setError(toErrorMessage(cause));
    }
  }, []);

  useEffect(() => {
    activationVersionRef.current += 1;
    if (!appId) {
      agentStore.getState().setSessions([]);
      agentStore.getState().setActiveSessionId(null);
      return;
    }

    let cancelled = false;
    void refreshSessions()
      .then(async (sessions) => {
        if (cancelled) return;
        if (sessions.length > 0) {
          await activateSession(sessions[0]!);
          return;
        }
        await createSession();
      })
      .catch((cause) => {
        if (!cancelled) setError(toErrorMessage(cause));
      });

    return () => {
      cancelled = true;
      activationVersionRef.current += 1;
    };
  }, [activateSession, appId, createSession, refreshSessions]);

  return { activateSession, createSession, error, refreshSessions, renameSession, selectSession };
}
