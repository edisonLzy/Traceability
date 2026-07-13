export interface AskUserQuestionOption {
  label: string;
  description: string;
}

export interface AskUserQuestion {
  header: string;
  question: string;
  options: AskUserQuestionOption[];
  multiSelect?: boolean;
}

export interface AskUserQuestionInput {
  questions: AskUserQuestion[];
}

export interface AskUserQuestionAnswer {
  question: string;
  selectedOptions: string[];
  customAnswer?: string;
}

export interface AskUserQuestionResult {
  answers: AskUserQuestionAnswer[];
  additionalNote?: string;
}

export interface AskUserQuestionRequest extends AskUserQuestionInput {
  requestId: string;
  createdAt: number;
  kind: "ask_user_question";
}

export interface AskUserQuestionRequestedEvent extends AskUserQuestionRequest {
  type: "ask_user_question_requested";
}

export type AskUserQuestionResolution = AskUserQuestionResult;
