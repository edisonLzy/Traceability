import { Agent } from '@earendil-works/pi-agent-core'
import type { AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core'
import type { AxiosInstance } from 'axios'
import type { Message } from '@earendil-works/pi-ai'
import type {
  AgentPromptInput,
  AgentRun,
  AgentRuntimeEvent,
  AgentSessionDetail,
  ModelRef,
} from '../../shared/ipc.js'
import { createMonitorTools, MonitorClient } from '../../built-in/monitor/main.js'
import { ModelRegistry } from './model-registry.js'
import { SessionStore } from './session-store.js'

export class AgentRuntime {
  private agent: Agent
  private activeRun: AgentRun | null = null
  private aborted = false
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null
  private pendingSnapshot: Record<string, unknown> | null = null

  constructor(
    private readonly sessionId: string,
    private readonly appId: string,
    private readonly store: SessionStore,
    private readonly models: ModelRegistry,
    private readonly monitorHttp: AxiosInstance,
    private readonly emit: (event: AgentRuntimeEvent) => void,
  ) {
    this.agent = this.createAgent()
  }

  hydrate(detail: AgentSessionDetail): void {
    this.agent.state.messages = detail.entries
      .filter((entry) => entry.type === 'message')
      .map((entry) => entry.data as unknown as AgentMessage)
    if (detail.model) void this.setModel(detail.model, false)
  }

  async setModel(model: ModelRef, persist = true): Promise<boolean> {
    const resolved = this.models.resolve(model)
    if (!resolved) return false
    this.agent.state.model = resolved
    if (persist) this.store.setModel(this.sessionId, model)
    return true
  }

  async prompt(input: AgentPromptInput): Promise<void> {
    if (this.activeRun || this.agent.state.isStreaming) throw new Error('Agent is already processing a message')
    if (input.context.appId !== this.appId) throw new Error('Agent sessions cannot access another application')

    if (input.model && !(await this.setModel(input.model))) {
      throw new Error(`Configured model ${input.model.providerId}/${input.model.modelId} is unavailable`)
    }
    if (!this.agent.state.model) throw new Error('Select a configured model before sending a message')

    this.aborted = false
    this.agent.state.systemPrompt = buildSystemPrompt(this.appId, input.context)
    const userMessage = {
      role: 'user',
      content: input.text.trim(),
      timestamp: Date.now(),
      metadata: { context: input.context },
    } as unknown as AgentMessage
    const userEntry = this.store.appendMessage(this.sessionId, userMessage as unknown as Record<string, unknown>)
    this.activeRun = this.store.startRun(this.sessionId, userEntry.id)
    this.emitEvent('run_started', { run: this.activeRun, userEntry })

    void this.agent.prompt(userMessage).catch((error: unknown) => {
      this.failRun(error)
    })
  }

  abort(): void {
    if (!this.activeRun) return
    this.aborted = true
    this.agent.abort()
  }

  dispose(): void {
    this.abort()
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
  }

  waitForIdle(): Promise<void> {
    return this.agent.waitForIdle()
  }

  private createAgent(): Agent {
    const agent = new Agent({
      sessionId: this.sessionId,
      convertToLlm: convertToLlm,
      getApiKey: (providerId) => this.models.getApiKey(providerId),
      initialState: {
        systemPrompt: buildSystemPrompt(this.appId, { appId: this.appId, source: 'general' }),
        tools: createMonitorTools(new MonitorClient(this.monitorHttp, this.appId)),
      },
    })

    agent.subscribe((event) => this.handleAgentEvent(event))
    return agent
  }

  private handleAgentEvent(event: AgentEvent): void {
    if (event.type === 'message_update') {
      this.scheduleSnapshot(event.message as unknown as Record<string, unknown>)
    }

    if (event.type === 'message_end') {
      const message = event.message as unknown as Record<string, unknown>
      const role = message.role
      if (role === 'assistant' || role === 'toolResult') {
        this.store.appendMessage(this.sessionId, message, extractTokenUsage(message))
      }
    }

    if (event.type === 'agent_end') {
      this.flushSnapshot()
      const run = this.activeRun
      if (run) {
        const errorMessage = this.agent.state.errorMessage
        const status = this.aborted ? 'aborted' : errorMessage ? 'failed' : 'completed'
        this.store.completeRun(run.id, status, errorMessage ? { message: errorMessage } : undefined)
        this.activeRun = null
      }
    }

    this.emitEvent(event.type, { event: event as unknown as Record<string, unknown> })
  }

  private failRun(error: unknown): void {
    this.flushSnapshot()
    if (this.activeRun) {
      const message = error instanceof Error ? error.message : String(error)
      this.store.completeRun(this.activeRun.id, this.aborted ? 'aborted' : 'failed', { message })
      this.activeRun = null
      this.emitEvent('run_failed', { message })
    }
  }

  private scheduleSnapshot(message: Record<string, unknown>): void {
    if (!this.activeRun) return
    this.pendingSnapshot = message
    if (this.snapshotTimer) return
    this.snapshotTimer = setTimeout(() => this.flushSnapshot(), 500)
  }

  private flushSnapshot(): void {
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
    this.snapshotTimer = null
    if (this.activeRun && this.pendingSnapshot) {
      this.store.updateRunSnapshot(this.activeRun.id, this.pendingSnapshot)
    }
    this.pendingSnapshot = null
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    this.emit({ type, sessionId: this.sessionId, payload })
  }
}

function convertToLlm(messages: AgentMessage[]): Message[] {
  return messages.flatMap((message) => {
    const role = (message as { role?: string }).role
    if (role === 'user') {
      const user = message as unknown as { content: unknown; timestamp?: number }
      return [{ role: 'user' as const, content: user.content, timestamp: user.timestamp ?? Date.now() } as Message]
    }
    if (role === 'assistant' || role === 'toolResult') return [message as Message]
    return []
  })
}

function buildSystemPrompt(appId: string, context: AgentPromptInput['context']): string {
  const contextDescription = context.issueId
    ? `The user is currently viewing issue ${context.issueId}.`
    : context.metricName
      ? `The user is currently viewing performance metric ${context.metricName}.`
      : context.source === 'performance'
        ? `The user is currently viewing performance over the last ${context.hours ?? 24} hours.`
        : 'The user is viewing the monitoring overview.'
  return [
    'You are Traceability Agent, a read-only assistant for runtime monitoring data.',
    `Your session is scoped to application ${appId}.`,
    contextDescription,
    'Use monitor tools to retrieve Issue, event, replay, and Performance data before making factual claims.',
    'Never claim that you changed source code, application settings, issue status, or remote data.',
  ].join('\n')
}

function extractTokenUsage(message: Record<string, unknown>) {
  const usage = message.usage
  if (!usage || typeof usage !== 'object') return null
  const candidate = usage as { input?: unknown; output?: unknown; cacheRead?: unknown; cacheWrite?: unknown; totalTokens?: unknown; cost?: unknown }
  if (typeof candidate.input !== 'number' || typeof candidate.output !== 'number' || typeof candidate.cacheRead !== 'number' || typeof candidate.cacheWrite !== 'number' || typeof candidate.totalTokens !== 'number') {
    return null
  }
  const cost = candidate.cost && typeof candidate.cost === 'object' ? candidate.cost as Record<string, unknown> : {}
  return {
    turn: {
      input: candidate.input,
      output: candidate.output,
      cacheRead: candidate.cacheRead,
      cacheWrite: candidate.cacheWrite,
      totalTokens: candidate.totalTokens,
      cost: {
        input: typeof cost.input === 'number' ? cost.input : 0,
        output: typeof cost.output === 'number' ? cost.output : 0,
        cacheRead: typeof cost.cacheRead === 'number' ? cost.cacheRead : 0,
        cacheWrite: typeof cost.cacheWrite === 'number' ? cost.cacheWrite : 0,
        total: typeof cost.total === 'number' ? cost.total : 0,
      },
    },
    latestCall: {
      input: candidate.input,
      output: candidate.output,
      cacheRead: candidate.cacheRead,
      cacheWrite: candidate.cacheWrite,
      totalTokens: candidate.totalTokens,
      cost: {
        input: typeof cost.input === 'number' ? cost.input : 0,
        output: typeof cost.output === 'number' ? cost.output : 0,
        cacheRead: typeof cost.cacheRead === 'number' ? cost.cacheRead : 0,
        cacheWrite: typeof cost.cacheWrite === 'number' ? cost.cacheWrite : 0,
        total: typeof cost.total === 'number' ? cost.total : 0,
      },
    },
  }
}
