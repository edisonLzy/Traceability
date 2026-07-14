import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import Emittery from "emittery";

import type { MonitoringContext } from "../shared/agent-message.js";
import type {
  AskUserQuestionInput,
  AskUserQuestionResult,
} from "../shared/ask-user-question-ipc.js";
import type { AllowedMainExposeEvents, AgentSessionScope } from "../shared/events-ipc.js";
import type { AgentModelsIPC } from "../shared/models-ipc.js";
import type { AgentSessionIPC } from "../shared/session-ipc.js";
import type { AgentSkillsIPC } from "../shared/skills-ipc.js";
import { AskUserQuestionService } from "./human-in-the-loop/ask-user-question-service.js";
import { ModelRegistry } from "./models/index.js";
import { TRACEABILITY_IDENTITY_PROMPT } from "./prompt/identity.js";
import { SystemPromptService } from "./prompt/index.js";
import { SkillService } from "./skills/index.js";

type AgentRuntimeEvents = {
  [K in keyof AllowedMainExposeEvents]: Omit<AllowedMainExposeEvents[K], "scope" | "sessionId">;
};

/** A single in-memory Agent, routed by AgentPool using its session id. */
export class AgentRuntime extends Emittery<AgentRuntimeEvents> {
  private readonly askUserQuestionService = new AskUserQuestionService();
  private readonly systemPromptService = new SystemPromptService();
  private readonly agent: Agent;
  private appId: string | undefined;
  private scope: AgentSessionScope = "main";
  private sessionId: string | undefined;

  constructor(
    private readonly modelRegistry: ModelRegistry,
    private readonly skillService: SkillService,
  ) {
    super();

    this.askUserQuestionService.on("human-in-the-loop", ({ data: request }) => {
      void this.emit("ask_user_question_requested", {
        type: "ask_user_question_requested",
        ...request,
      });
    });

    this.agent = new Agent({
      convertToLlm,
      getApiKey: (providerId) => this.modelRegistry.resolveApiKey(providerId),
      initialState: {
        systemPrompt: TRACEABILITY_IDENTITY_PROMPT,
        // Traceability Agent is read-only. It intentionally exposes no local,
        // shell, filesystem, artifact, or permission-gated tools.
        tools: [],
      },
    });

    this.agent.subscribe((event) => {
      void this.emit(event.type, event);
      if (event.type === "agent_end" && this.agent.hasQueuedMessages()) {
        this.scheduleQueuedContinue();
      }
    });
  }

  public setSessionId(sessionId: string, appId: string): void {
    this.sessionId = sessionId;
    this.appId = appId;
    this.agent.sessionId = sessionId;
  }

  public setSessionScope(scope: AgentSessionScope): void {
    this.scope = scope;
  }

  public getScope(): AgentSessionScope {
    return this.scope;
  }

  public async setHistoryMessages(messages: AgentMessage[]): Promise<void> {
    this.agent.state.messages = messages;
  }

  public async setModel(model: Parameters<AgentModelsIPC["setModel"]>[1]): Promise<boolean> {
    const resolved = this.modelRegistry.resolveModel(model.providerId, model.modelId);
    if (!resolved) return false;

    this.agent.state.model = resolved;
    return true;
  }

  public async prompt(message: Parameters<AgentSessionIPC["prompt"]>[1]): Promise<void> {
    this.assertConfiguredForPrompt(message);

    if (message.metadata?.model && !(await this.setModel(message.metadata.model))) {
      throw new Error(
        `Configured model ${message.metadata.model.providerId}/${message.metadata.model.modelId} is unavailable`,
      );
    }
    if (!this.agent.state.model) {
      throw new Error("Select a configured model before sending a message");
    }

    const content =
      typeof message.content === "string"
        ? this.skillService.expandSkillReferences(message.content, message.metadata?.skillIds ?? [])
        : message.content;
    const monitoringContext = message.metadata?.monitoringContext;
    this.agent.state.systemPrompt = this.systemPromptService.buildSystemPrompt(
      [TRACEABILITY_IDENTITY_PROMPT, buildMonitoringContext(monitoringContext)]
        .filter(Boolean)
        .join("\n\n"),
    );

    const routedMessage = { ...message, content };
    if (message.kind === "steering") {
      this.agent.steer(routedMessage);
      return;
    }
    if (message.kind === "follow-up") {
      this.agent.followUp(routedMessage);
      return;
    }
    await this.agent.prompt(routedMessage);
  }

  public async clearAllQueues(): Promise<void> {
    this.agent.clearAllQueues();
  }

  public async abortPrompt(): Promise<void> {
    this.askUserQuestionService.cancelAll("Agent prompt aborted");
    this.agent.abort();
  }

  public async askUserQuestion(input: AskUserQuestionInput): Promise<AskUserQuestionResult> {
    if (!this.sessionId || !this.appId) {
      throw new Error("Ask user question is not configured for this Agent runtime");
    }
    if (this.scope !== "main") {
      throw new Error("Ask user question is only supported by the main Agent");
    }
    return this.askUserQuestionService.request(input);
  }

  public async resolveAskUserQuestion(
    requestId: string,
    resolution: AskUserQuestionResult,
  ): Promise<void> {
    this.askUserQuestionService.resolve(requestId, resolution);
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

  public destroy(): void {
    this.askUserQuestionService.cancelAll("Agent runtime destroyed");
    this.agent.abort();
    this.clearListeners();
  }

  public waitForIdle(): Promise<void> {
    return this.agent.waitForIdle();
  }

  private assertConfiguredForPrompt(message: Parameters<AgentSessionIPC["prompt"]>[1]): void {
    if (!this.sessionId || !this.appId) {
      throw new Error("Activate a conversation before sending a message");
    }
    if (message.metadata?.monitoringContext?.appId !== this.appId) {
      throw new Error("Agent sessions cannot access another application");
    }
  }

  private scheduleQueuedContinue(): void {
    setTimeout(() => {
      if (this.agent.state.isStreaming || !this.agent.hasQueuedMessages()) return;
      void this.agent.continue().catch((error: unknown) => {
        console.error("Failed to continue queued Agent messages", error);
      });
    }, 0);
  }
}

function convertToLlm(messages: AgentMessage[]): Message[] {
  return messages.flatMap((message): Message[] => {
    if (message.role === "user") {
      return [
        {
          role: "user",
          content: message.content,
          timestamp: message.timestamp,
        },
      ];
    }
    if (message.role === "assistant" || message.role === "toolResult") return [message];
    return [];
  });
}

function buildMonitoringContext(context: MonitoringContext | undefined): string {
  if (!context) return "";
  if (context.issueId) return `The user is viewing monitoring issue ${context.issueId}.`;
  if (context.metricName) return `The user is viewing metric ${context.metricName}.`;
  if (context.source === "performance") {
    return `The user is viewing performance data for the last ${context.hours ?? 24} hours.`;
  }
  return "The user is viewing the monitoring overview.";
}
