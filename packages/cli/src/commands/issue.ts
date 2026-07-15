import { readFileSync } from "node:fs";

import type { IssueStatus } from "@traceability/protocol";
import { Command } from "commander";

import { getClient } from "../lib/client.js";
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
      const res = await getClient().issues.list({
        appId: opts.appId,
        ...(opts.status ? { status: opts.status as IssueStatus } : {}),
        limit: Number(opts.limit),
      });
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
      const issue = await getClient().issues.get(issueId);
      printJson(issue);
    });

  cmd.command("fix-request <issueId>").action(async (issueId) => {
    await getClient().issues.requestFix(issueId);
    console.log(`Issue ${issueId} marked fix-manual.`);
  });

  cmd
    .command("attach-patch <issueId>")
    .requiredOption("--patch <path>")
    .requiredOption("--branch <branch>")
    .action(async (issueId, opts) => {
      const patch = readFileSync(opts.patch, "utf8");
      const issue = await getClient().issues.attachPatch(issueId, {
        branch: opts.branch,
        patch,
      });
      console.log(`Patch attached: ${issue.id}`);
    });

  cmd.command("mark-fixed <issueId>").action(async (issueId) => {
    await getClient().issues.markFixed(issueId);
    console.log(`Issue ${issueId} marked fixed.`);
  });
}
