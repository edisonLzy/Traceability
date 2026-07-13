import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { afterEach, describe, expect, it } from "vitest";

import { AgentRuntime } from "./agent-runtime.js";
import type { ModelRegistry } from "./models/index.js";
import type { SkillService } from "./skills/index.js";

const runtimes: AgentRuntime[] = [];

afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.destroy();
});

describe("AgentRuntime", () => {
  it("starts tool-free and rejects a prompt outside its application scope", async () => {
    const runtime = new AgentRuntime(
      {
        resolveApiKey: () => undefined,
        resolveModel: () => undefined,
      } as unknown as ModelRegistry,
      {
        expandSkillReferences: (content: string) => content,
        listSkills: () => [],
        setSkillEnabled: () => [],
      } as unknown as SkillService,
    );
    runtimes.push(runtime);
    runtime.setSessionId("session-a", "app-a");

    const agent = runtime as unknown as { agent: { state: { tools: unknown[] } } };
    expect(agent.agent.state.tools).toEqual([]);

    const message: AppUserMessage = {
      role: "user",
      content: "Investigate this issue",
      timestamp: Date.now(),
      kind: "prompt",
      jsonContent: { type: "doc" },
      metadata: { monitoringContext: { appId: "app-b", source: "general" } },
    };

    await expect(runtime.prompt(message)).rejects.toThrow(
      "Agent sessions cannot access another application",
    );
  });
});
