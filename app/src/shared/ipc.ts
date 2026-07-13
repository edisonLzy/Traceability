export interface AvailableModel {
  providerId: string
  providerName: string
  modelId: string
  modelName: string
  contextWindow?: number
  maxTokens?: number
}

export interface ModelRef {
  providerId: string
  modelId: string
}

export type AgentSessionStatus = 'idle' | 'running' | 'interrupted' | 'failed'
export type AgentRunStatus = 'running' | 'completed' | 'aborted' | 'failed' | 'interrupted'
export type AgentEntryType = 'message' | 'model_change'

export interface TokenUsage {
  turn: Usage
  latestCall: Usage
}

export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  cost: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
}

export interface AgentSessionSummary {
  id: string
  appId: string
  title: string
  model: ModelRef | null
  status: AgentSessionStatus
  createdAt: number
  updatedAt: number
}

export interface AgentEntry {
  id: string
  sessionId: string
  sequence: number
  type: AgentEntryType
  data: Record<string, unknown>
  tokenUsage: TokenUsage | null
  createdAt: number
}

export interface AgentArtifact {
  id: string
  sessionId: string
  extensionId: string
  type: string
  name: string | null
  content: Record<string, unknown>
  updatedAt: number
}

export interface AgentRun {
  id: string
  sessionId: string
  userEntryId: string
  status: AgentRunStatus
  partialMessage: Record<string, unknown> | null
  error: { message: string; code?: string } | null
  startedAt: number
  completedAt: number | null
}

export interface AgentSessionDetail extends AgentSessionSummary {
  entries: AgentEntry[]
  artifacts: AgentArtifact[]
  latestRun: AgentRun | null
}

export interface AskUserQuestionOption {
  label: string
  description: string
}

export interface AskUserQuestion {
  header: string
  question: string
  multiSelect?: boolean
  options: AskUserQuestionOption[]
}

export interface AskUserQuestionRequest {
  requestId: string
  sessionId: string
  questions: AskUserQuestion[]
}

export interface AskUserQuestionResolution {
  sessionId: string
  requestId: string
  answers: Record<string, string[]>
}

export interface AgentPromptInput {
  sessionId: string
  text: string
  model?: ModelRef
  context: {
    appId: string
    source: 'general' | 'issue' | 'performance' | 'metric'
    issueId?: string
    metricName?: string
    hours?: 1 | 24 | 168
  }
}

export interface AgentRuntimeEvent {
  type: string
  sessionId: string
  payload: Record<string, unknown>
}
