import type {
  AskUserQuestionRequest,
  AskUserQuestionResolution,
} from "@shared/ask-user-question-ipc";
import type { StateCreator } from "zustand/vanilla";

import type { AgentStoreState } from "./index";

export interface SessionHumanInTheLoopState {
  requests: AskUserQuestionRequest[];
  lastResolvedRequest?: {
    requestId: string;
    resolution: AskUserQuestionResolution;
    resolvedAt: number;
  };
}

export interface HumanInTheLoopSlice {
  humanInTheLoopStates: Map<string, SessionHumanInTheLoopState>;
  getHumanInTheLoopState: (sessionId: string) => SessionHumanInTheLoopState;
  enqueueHumanInTheLoopRequest: (sessionId: string, request: AskUserQuestionRequest) => void;
  resolveHumanInTheLoopRequest: (
    sessionId: string,
    requestId: string,
    resolution: AskUserQuestionResolution,
  ) => void;
  clearHumanInTheLoopState: (sessionId: string) => void;
}

const EMPTY_STATE: SessionHumanInTheLoopState = { requests: [] };

export const createHumanInTheLoopSlice: StateCreator<
  AgentStoreState,
  [],
  [],
  HumanInTheLoopSlice
> = (set, get) => ({
  humanInTheLoopStates: new Map(),
  getHumanInTheLoopState: (sessionId) => get().humanInTheLoopStates.get(sessionId) ?? EMPTY_STATE,
  enqueueHumanInTheLoopRequest: (sessionId, request) => {
    set((previous) => {
      const states = new Map(previous.humanInTheLoopStates);
      const current = states.get(sessionId) ?? EMPTY_STATE;
      states.set(sessionId, { ...current, requests: [...current.requests, request] });
      return { humanInTheLoopStates: states };
    });
  },
  resolveHumanInTheLoopRequest: (sessionId, requestId, resolution) => {
    set((previous) => {
      const states = new Map(previous.humanInTheLoopStates);
      const current = states.get(sessionId) ?? EMPTY_STATE;
      states.set(sessionId, {
        requests: current.requests.filter((request) => request.requestId !== requestId),
        lastResolvedRequest: { requestId, resolution, resolvedAt: Date.now() },
      });
      return { humanInTheLoopStates: states };
    });
  },
  clearHumanInTheLoopState: (sessionId) => {
    set((previous) => {
      const states = new Map(previous.humanInTheLoopStates);
      states.delete(sessionId);
      return { humanInTheLoopStates: states };
    });
  },
});
