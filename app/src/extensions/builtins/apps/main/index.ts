import { Type } from "@earendil-works/pi-ai";
import { createTraceabilityClient } from "@traceability/client";
import type { Application } from "@traceability/protocol";

import { defineMainExtension } from "../../../core/main/index.js";
import { APPS_EXTENSION } from "../common/extension.js";
import { APPS_LIST_BLOCK_TYPE, APPS_LIST_TOOL } from "../common/types.js";

// Transient server client for the apps extension. Server auth is disabled for
// the MVP (tokens are ignored), but the client guards on a non-empty token.
const client = createTraceabilityClient({
  baseUrl: process.env.TRACEABILITY_SERVER_URL ?? "http://localhost:3000",
  token: "traceability",
});

export default defineMainExtension({
  ...APPS_EXTENSION,
  setup(ctx) {
    ctx.systemPrompt.register({
      id: "apps.prompt",
      content: `Use the ${APPS_LIST_TOOL} tool to list the user's Traceability apps when they ask about their apps or when you need to know which apps exist. The result is rendered as a read-only card in the chat.`,
    });

    ctx.tools.register({
      name: APPS_LIST_TOOL,
      label: "List Apps",
      description: "List all Traceability apps.",
      executionMode: "sequential",
      parameters: Type.Object({}),
      async execute() {
        const apps = await client.apps.list();
        return {
          content: [{ type: "text", text: summarizeApps(apps) }],
          details: {
            type: "monitor.apps.runtime",
            assistantBlock: { type: APPS_LIST_BLOCK_TYPE, props: { apps } },
          },
        };
      },
    });
  },
});

function summarizeApps(apps: Application[]): string {
  if (apps.length === 0) return "No Traceability apps found.";
  return apps
    .map((app) => `- ${app.name} (${app.id}) - repo: ${app.repoUrl}, branch: ${app.defaultBranch}`)
    .join("\n");
}
