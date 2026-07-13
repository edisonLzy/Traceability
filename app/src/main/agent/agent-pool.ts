import type { BrowserWindow } from 'electron'
import type {
  AgentPromptInput,
  AgentSessionDetail,
  AgentSessionSummary,
  AvailableModel,
  ModelRef,
} from '../../shared/ipc.js'
import { AgentRuntime } from './agent-runtime.js'
import { ModelRegistry } from './model-registry.js'
import { RendererDataBroker } from './renderer-data-broker.js'
import { SessionStore } from './session-store.js'

export class AgentPool {
  private readonly runtimes = new Map<string, AgentRuntime>()
  readonly dataBroker: RendererDataBroker

  constructor(
    private readonly sessions: SessionStore,
    private readonly models: ModelRegistry,
    private readonly getWindow: () => BrowserWindow | null,
  ) {
    this.dataBroker = new RendererDataBroker(this.getWindow)
  }

  async initialize(): Promise<void> {
    this.sessions.recoverInterruptedRuns()
    await this.models.reload()
  }

  listSessions(appId: string): AgentSessionSummary[] {
    return this.sessions.list(appId)
  }

  createSession(appId: string): AgentSessionSummary {
    return this.sessions.create(appId)
  }

  getSession(sessionId: string): AgentSessionDetail | null {
    return this.sessions.get(sessionId)
  }

  renameSession(sessionId: string, title: string): void {
    this.sessions.rename(sessionId, title)
  }

  deleteSession(sessionId: string): void {
    this.destroyRuntime(sessionId)
    this.sessions.delete(sessionId)
  }

  async setModel(sessionId: string, model: ModelRef): Promise<boolean> {
    const runtime = this.getOrCreateRuntime(sessionId)
    return runtime.setModel(model)
  }

  async prompt(input: AgentPromptInput): Promise<void> {
    const runtime = this.getOrCreateRuntime(input.sessionId)
    await runtime.prompt(input)
  }

  abort(sessionId: string): void {
    this.runtimes.get(sessionId)?.abort()
  }

  listModels(): AvailableModel[] {
    return this.models.list()
  }

  async reloadModels(): Promise<AvailableModel[]> {
    return this.models.reload()
  }

  resolveMonitorData(requestId: string, result: unknown): void {
    this.dataBroker.resolve(requestId, result)
  }

  rejectMonitorData(requestId: string, error: { message: string; code?: string }): void {
    this.dataBroker.reject(requestId, error)
  }

  dispose(): void {
    for (const runtime of this.runtimes.values()) runtime.dispose()
    this.runtimes.clear()
    this.dataBroker.dispose()
  }

  private getOrCreateRuntime(sessionId: string): AgentRuntime {
    const existing = this.runtimes.get(sessionId)
    if (existing) return existing

    const detail = this.sessions.get(sessionId)
    if (!detail) throw new Error('Session not found')
    const runtime = new AgentRuntime(
      detail.id,
      detail.appId,
      this.sessions,
      this.models,
      this.dataBroker,
      (event) => this.sendEvent(event),
    )
    runtime.hydrate(detail)
    this.runtimes.set(sessionId, runtime)
    return runtime
  }

  private destroyRuntime(sessionId: string): void {
    this.runtimes.get(sessionId)?.dispose()
    this.runtimes.delete(sessionId)
  }

  private sendEvent(event: { type: string; sessionId: string; payload: Record<string, unknown> }): void {
    const window = this.getWindow()
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    window.webContents.send('agent:event', event)
  }
}
