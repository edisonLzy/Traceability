import { readFileSync } from "node:fs";

import type { Issue, IssueStatus } from "@traceability/protocol";
import { Command } from "commander";

import { api } from "../lib/api.js";
import { printJson, printTable } from "../lib/output.js";

export function issueCommand(program: Command): void {
  const cmd = program.command("issue").description("list and act on issues");
  cmd
    .command("list")
    .requiredOption("--appId <id>")
    .option("--status <status>")
    .option("--limit <n>", "max results", "20")
    .option("--json", "output JSON")
    .action(async (opts) => {
      const qs = new URLSearchParams({ appId: opts.appId, limit: opts.limit });
      if (opts.status) qs.set("status", opts.status);
      const res = await api.get<{ items: Issue[] }>(`/api/issues?${qs}`);
      opts.json
        ? printJson(res)
        : printTable(res.items, [
            { key: "id", label: "ID", width: 36 },
            { key: "title", label: "TITLE", width: 40 },
            { key: "status", label: "STATUS", width: 12 },
            { key: "count", label: "COUNT", width: 6 },
          ]);
    });

  cmd
    .command("show <issueId>")
    .option("--json", "output JSON")
    .action(async (issueId, opts) => {
      const issue = await api.get<Issue>(`/api/issues/${issueId}`);
      printJson(issue);
    });

  cmd.command("fix-request <issueId>").action(async (issueId) => {
    const issue = await api.post<Issue>(`/api/issues/${issueId}/fix-request`);
    console.log(`Issue ${issueId} marked fix-manual.`);
  });

  cmd
    .command("attach-patch <issueId>")
    .requiredOption("--patch <path>")
    .requiredOption("--branch <branch>")
    .action(async (issueId, opts) => {
      const patch = readFileSync(opts.patch, "utf8");
      const res = await api.post<{ id: string }>(`/api/issues/${issueId}/attach-patch`, {
        branch: opts.branch,
        patch,
      });
      console.log(`Patch attached: ${res.id}`);
    });

  cmd.command("mark-fixed <issueId>").action(async (issueId) => {
    await api.post(`/api/issues/${issueId}/mark-fixed`);
    console.log(`Issue ${issueId} marked fixed.`);
  });
}
