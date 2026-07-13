import type { BrowserWindow } from "electron";
import Emittery from "emittery";

import type { AllowedMainExposeEvents } from "../shared/events-ipc.js";
import type { AgentModelsIPC } from "../shared/models-ipc.js";
import type { AgentSessionIPC } from "../shared/session-ipc.js";
import type { AgentSkillsIPC } from "../shared/skills-ipc.js";
import { AbstractAgentIPCHandler } from "./agent-ipc.js";
import { AgentRuntime } from "./agent-runtime.js";
import { ModelRegistry } from "./models/index.js";
import { SkillService } from "./skills/index.js";

/** Routes session-scoped IPC to independent read-only Agent runtimes. */
export class AgentPool
  extends AbstractAgentIPCHandler<AgentSessionIPC & AgentModelsIPC & AgentSkillsIPC>
  implements AgentSessionIPC, AgentModelsIPC, AgentSkillsIPC
{
  private readonly events = new Emittery<AllowedMainExposeEvents>();
  private readonly modelRegistry = new ModelRegistry();
  private readonly runtimes = new Map<string, AgentRuntime>();
  private readonly skillService = new SkillService();

  constructor(browserWindow: BrowserWindow) {
    super(browserWindow);
    this.unbind = this.bind();
  }

  public async setSessionId(sessionId: string, appId: string): Promise<void> {
    this.getOrCreateRuntime(sessionId).setSessionId(sessionId, appId);
  }

  public async setSessionScope(
    sessionId: string,
    scope: Parameters<AgentSessionIPC["setSessionScope"]>[1],
  ): Promise<void> {
    this.getOrCreateRuntime(sessionId).setSessionScope(scope);
  }

  public async destroySession(sessionId: string): Promise<void> {
    await this.destroyAgent(sessionId);
  }

  public async setHistoryMessages(
    sessionId: string,
    messages: Parameters<AgentSessionIPC["setHistoryMessages"]>[1],
  ): Promise<void> {
    await this.getOrCreateRuntime(sessionId).setHistoryMessages(messages);
  }

  public async setPermissionMode(
    sessionId: string,
    mode: Parameters<AgentSessionIPC["setPermissionMode"]>[1],
  ): Promise<void> {
    await this.getOrCreateRuntime(sessionId).setPermissionMode(mode);
  }

  public async resolvePermissionRequest(
    sessionId: string,
    requestId: string,
    resolution: Parameters<AgentSessionIPC["resolvePermissionRequest"]>[2],
  ): Promise<void> {
    await this.getOrCreateRuntime(sessionId).resolvePermissionRequest(requestId, resolution);
  }

  public async resolveAskUserQuestion(
    sessionId: string,
    requestId: string,
    resolution: Parameters<AgentSessionIPC["resolveAskUserQuestion"]>[2],
  ): Promise<void> {
    await this.getOrCreateRuntime(sessionId).resolveAskUserQuestion(requestId, resolution);
  }

  public async prompt(
    sessionId: string,
    message: Parameters<AgentSessionIPC["prompt"]>[1],
  ): Promise<void> {
    await this.getOrCreateRuntime(sessionId).prompt(message);
  }

  public async clearAllQueues(sessionId: string): Promise<void> {
    await this.getOrCreateRuntime(sessionId).clearAllQueues();
  }

  public async abortPrompt(sessionId: string): Promise<void> {
    const runtime = this.runtimes.get(sessionId);
    if (runtime) await runtime.abortPrompt();
  }

  public async setModel(
    sessionId: string,
    model: Parameters<AgentModelsIPC["setModel"]>[1],
  ): Promise<boolean> {
    const runtime = this.runtimes.get(sessionId);
    return runtime ? runtime.setModel(model) : false;
  }

  public async getAvailableModels(): Promise<
    Awaited<ReturnType<AgentModelsIPC["getAvailableModels"]>>
  > {
    const models = await this.modelRegistry.getAvailableModels();
    return models.map((model) => ({
      modelId: model.id,
      providerId: model.provider,
      providerName: model.provider,
      modelName: model.name ?? model.id,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
    }));
  }

  public async getModelConfig(): Promise<Awaited<ReturnType<AgentModelsIPC["getModelConfig"]>>> {
    return this.modelRegistry.getConfig();
  }

  public async saveModelConfig(
    config: Parameters<AgentModelsIPC["saveModelConfig"]>[0],
  ): Promise<void> {
    await this.modelRegistry.saveConfig(config);
  }

  public async listSkills(): Promise<Awaited<ReturnType<AgentSkillsIPC["listSkills"]>>> {
    return this.skillService.listSkills();
  }

  public async setSkillEnabled(
    skillId: string,
    enabled: boolean,
  ): Promise<Awaited<ReturnType<AgentSkillsIPC["setSkillEnabled"]>>> {
    return this.skillService.setSkillEnabled(skillId, enabled);
  }

  public async destroyAll(): Promise<void> {
    for (const sessionId of [...this.runtimes.keys()]) {
      await this.destroyAgent(sessionId);
    }
    this.events.clearListeners();
    this.unbind?.();
  }

  protected override bind(): VoidFunction {
    const channels = [
      "setModel",
      "getAvailableModels",
      "getModelConfig",
      "saveModelConfig",
      "prompt",
      "clearAllQueues",
      "abortPrompt",
      "setHistoryMessages",
      "setSessionId",
      "setSessionScope",
      "destroySession",
      "setPermissionMode",
      "resolvePermissionRequest",
      "resolveAskUserQuestion",
      "listSkills",
      "setSkillEnabled",
    ] as const;

    for (const channel of channels) {
      const handler = (this as unknown as Record<string, (...args: unknown[]) => unknown>)[channel];
      if (!handler) throw new Error(`Missing Agent IPC handler: ${channel}`);
      this.typedIpcMain.handle(channel, handler.bind(this) as never);
    }

    const offAny = this.events.onAny(({ name, data }) => {
      if (typeof name === "string") this.sendMessageToRenderer(name, data);
    });

    return () => {
      for (const channel of channels) this.typedIpcMain.removeHandler(channel);
      offAny();
    };
  }

  private getOrCreateRuntime(sessionId: string): AgentRuntime {
    const existing = this.runtimes.get(sessionId);
    if (existing) return existing;

    const runtime = new AgentRuntime(this.modelRegistry, this.skillService);
    runtime.onAny(({ name, data }) => {
      if (typeof name !== "string") return;
      void (this.events.emit as (event: string, payload: unknown) => Promise<void>)(name, {
        scope: runtime.getScope(),
        sessionId,
        ...(data as object),
      });
    });
    this.runtimes.set(sessionId, runtime);
    return runtime;
  }

  private async destroyAgent(sessionId: string): Promise<void> {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return;
    runtime.destroy();
    this.runtimes.delete(sessionId);
  }
}
