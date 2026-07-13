import type {
  AskUserQuestionRequest,
  AskUserQuestionResolution,
} from "@shared/ask-user-question-ipc";
import type { StateCreator } from "zustand/vanilla";

export interface HumanInputSlice {
  questionsBySession: Map<string, AskUserQuestionRequest[]>;

  clearQuestions: (sessionId: string) => void;
  enqueueQuestion: (sessionId: string, question: AskUserQuestionRequest) => void;
  getQuestions: (sessionId: string) => AskUserQuestionRequest[];
  resolveQuestion: (
    sessionId: string,
    requestId: string,
    resolution: AskUserQuestionResolution,
  ) => void;
}

const EMPTY_QUESTIONS: AskUserQuestionRequest[] = [];

export const createHumanInputSlice: StateCreator<HumanInputSlice, [], [], HumanInputSlice> = (
  set,
  get,
) => ({
  questionsBySession: new Map(),

  clearQuestions: (sessionId) => {
    set((previous) => {
      const questionsBySession = new Map(previous.questionsBySession);
      questionsBySession.delete(sessionId);
      return { questionsBySession };
    });
  },

  enqueueQuestion: (sessionId, question) => {
    set((previous) => {
      const questionsBySession = new Map(previous.questionsBySession);
      const questions = questionsBySession.get(sessionId) ?? EMPTY_QUESTIONS;
      if (questions.some((current) => current.requestId === question.requestId)) return previous;
      questionsBySession.set(sessionId, [...questions, question]);
      return { questionsBySession };
    });
  },

  getQuestions: (sessionId) => get().questionsBySession.get(sessionId) ?? EMPTY_QUESTIONS,

  resolveQuestion: (sessionId, requestId, _resolution) => {
    set((previous) => {
      const questions = previous.questionsBySession.get(sessionId);
      if (!questions) return previous;
      const questionsBySession = new Map(previous.questionsBySession);
      const remaining = questions.filter((question) => question.requestId !== requestId);
      if (remaining.length === 0) questionsBySession.delete(sessionId);
      else questionsBySession.set(sessionId, remaining);
      return { questionsBySession };
    });
  },
});
