import { Type } from "@earendil-works/pi-ai";
import { createTraceabilityClient } from "@traceability/client";
import type { Issue, IssueStatus } from "@traceability/protocol";

import { defineMainExtension } from "../../../core/main/index.js";
import type { MainExtensionContext } from "../../../core/main/index.js";
import { ISSUES_EXTENSION } from "../common/extension.js";
import { ISSUES_GET_TOOL, ISSUES_LIST_BLOCK_TYPE, ISSUES_LIST_TOOL } from "../common/types.js";

// Transient server client for the issues extension. Server auth is disabled for
// the MVP (tokens are ignored), but the client guards on a non-empty token.
const client = createTraceabilityClient({
  baseUrl: process.env.TRACEABILITY_SERVER_URL ?? "http://localhost:3000",
  token: "traceability",
});

export default defineMainExtension({
  ...ISSUES_EXTENSION,
  setup(ctx) {
    ctx.systemPrompt.register({
      id: "issues.prompt",
      content: `Use the ${ISSUES_LIST_TOOL} tool to list issues for a Traceability app and ${ISSUES_GET_TOOL} to fetch a single issue's full detail.
- Pass appId when known; if unknown, omit it and the user will pick an app.
- Optional filters: status (open | fix-manual | fixing | fixed), limit (default 20).
Present results concisely; the UI renders an interactive card for the issue list (clickable to open the issue detail).`,
    });

    ctx.tools.register({
      name: ISSUES_LIST_TOOL,
      label: "List Issues",
      description:
        "List issues for a Traceability app. appId is optional; if omitted, the user picks an app.",
      executionMode: "sequential",
      parameters: Type.Object({
        appId: Type.Optional(Type.String({ description: "App ID. Omit to let the user pick." })),
        status: Type.Optional(
          Type.String({ description: "Filter: open | fix-manual | fixing | fixed" }),
        ),
        limit: Type.Optional(Type.Number({ description: "Max issues to return (default 20)." })),
      }),
      async execute(_toolCallId, args) {
        let appId = typeof args.appId === "string" && args.appId ? args.appId : undefined;
        if (!appId) appId = await resolveAppId(ctx);
        const status = typeof args.status === "string" ? (args.status as IssueStatus) : undefined;
        const res = await client.issues.list({
          appId,
          ...(status ? { status } : {}),
          limit: args.limit ?? 20,
        });
        return {
          content: [{ type: "text", text: summarizeIssues(res.items) }],
          details: {
            type: "monitor.issues.runtime",
            assistantBlock: {
              type: ISSUES_LIST_BLOCK_TYPE,
              props: { issues: res.items, appId, nextCursor: res.nextCursor },
            },
          },
        };
      },
    });

    ctx.tools.register({
      name: ISSUES_GET_TOOL,
      label: "Get Issue Detail",
      description: "Get a single issue's full detail by ID.",
      executionMode: "sequential",
      parameters: Type.Object({
        issueId: Type.String({ description: "Issue ID." }),
      }),
      async execute(_toolCallId, args) {
        const issue = await client.issues.get(args.issueId);
        // No assistantBlock -> the renderer renders no card for this tool; the
        // issue detail is surfaced as plain text only.
        return {
          content: [{ type: "text", text: summarizeIssue(issue) }],
          details: { type: "monitor.issue.detail" },
        };
      },
    });
  },
});

/**
 * When the agent did not supply an appId, narrow it down: auto-pick the only
 * app, or ask the user to choose when more than one exists.
 */
async function resolveAppId(ctx: MainExtensionContext): Promise<string> {
  const apps = await client.apps.list();
  if (apps.length === 0) {
    throw new Error("No Traceability apps found.");
  }
  if (apps.length === 1) {
    return apps[0]!.id;
  }

  const result = await ctx.extensionRuntime.askUserQuestion({
    questions: [
      {
        header: "Select app",
        question: "Which app's issues do you want to view?",
        options: apps.map((app) => ({ label: app.name, description: app.id })),
      },
    ],
  });
  const selected = result.answers[0]?.selectedOptions[0];
  const app = apps.find((item) => item.name === selected);
  if (!app) {
    throw new Error("No app selected.");
  }
  return app.id;
}

function summarizeIssues(items: Issue[]): string {
  if (items.length === 0) return "No issues found.";
  return items
    .map(
      (issue) =>
        `- ${issue.title} [${issue.status}] (x${issue.count}, last ${issue.lastSeen}) - ${issue.id}`,
    )
    .join("\n");
}

function summarizeIssue(issue: Issue): string {
  const lines = [
    `# ${issue.title}`,
    `ID: ${issue.id}`,
    `App: ${issue.appId}`,
    `Type: ${issue.type}`,
    `Status: ${issue.status}`,
    `Count: ${issue.count}`,
    `First seen: ${issue.firstSeen}`,
    `Last seen: ${issue.lastSeen}`,
  ];
  if (issue.metadata.message) lines.push(`Message: ${issue.metadata.message}`);
  if (issue.metadata.stacktrace) lines.push(`Stacktrace:\n${issue.metadata.stacktrace}`);
  return lines.join("\n");
}
