import type { Application } from "@traceability/protocol";
import { Command } from "commander";

import { getClient } from "../lib/client.js";
import { printJson, printTable } from "../lib/output.js";

export function appCommand(program: Command): void {
  const cmd = program.command("app").description("manage applications");
  cmd
    .command("list")
    .option("--json", "output JSON")
    .action(async (opts) => {
      const apps = await getClient().apps.list();
      opts.json
        ? printJson(apps)
        : printTable(apps, [
            { key: "id", label: "ID", width: 36 },
            { key: "name", label: "NAME", width: 20 },
            { key: "defaultBranch", label: "BRANCH", width: 12 },
          ]);
    });

  cmd
    .command("create")
    .requiredOption("--name <name>")
    .requiredOption("--repo-url <url>")
    .requiredOption("--branch <branch>")
    .option("--json", "output JSON")
    .action(async (opts) => {
      const app = await getClient().apps.create({
        name: opts.name,
        repoUrl: opts.repoUrl,
        defaultBranch: opts.branch,
      });
      opts.json ? printJson(app) : console.log(`Created app ${app.id} (${app.name})`);
    });

  cmd
    .command("show <appId>")
    .option("--json", "output JSON")
    .action(async (appId, opts) => {
      const app: Application = await getClient().apps.get(appId);
      printJson(app);
    });

  cmd
    .command("update <appId>")
    .option("--name <name>")
    .option("--repo-url <url>")
    .option("--branch <branch>")
    .action(async (appId, opts) => {
      const app = await getClient().apps.update(appId, {
        ...(opts.name ? { name: opts.name } : {}),
        ...(opts.repoUrl ? { repoUrl: opts.repoUrl } : {}),
        ...(opts.branch ? { defaultBranch: opts.branch } : {}),
      });
      printJson(app);
    });

  cmd.command("delete <appId>").action(async (appId) => {
    await getClient().apps.remove(appId);
    console.log("Deleted.");
  });
}
