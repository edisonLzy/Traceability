import type {
  AgentPromptInput,
  AgentRuntimeEvent,
  AgentSessionDetail,
  AgentSessionSummary,
  AvailableModel,
  ModelRef,
} from './shared/ipc'

declare global {
  interface Window {
    traceability: {
      sessions: {
        list(appId: string): Promise<AgentSessionSummary[]>
        create(appId: string): Promise<AgentSessionSummary>
        get(sessionId: string): Promise<AgentSessionDetail | null>
        rename(input: { sessionId: string; title: string }): Promise<void>
        delete(sessionId: string): Promise<void>
        setModel(input: { sessionId: string; model: ModelRef }): Promise<boolean>
      }
      agent: {
        prompt(input: AgentPromptInput): Promise<void>
        abort(sessionId: string): Promise<void>
        listModels(): Promise<AvailableModel[]>
        reloadModels(): Promise<AvailableModel[]>
        onEvent(listener: (event: AgentRuntimeEvent) => void): () => void
      }
    }
  }
}

export {}
