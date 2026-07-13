#!/usr/bin/env node
import { Command } from "commander";

import { appCommand } from "./commands/app.js";
import { configCommand } from "./commands/config.js";
import { issueCommand } from "./commands/issue.js";

const program = new Command();
program.name("traceability").description("Traceability CLI").version("1.0.0");

configCommand(program);
appCommand(program);
issueCommand(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
