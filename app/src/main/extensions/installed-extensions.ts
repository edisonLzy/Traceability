import appsExtension from "../../extensions/builtins/apps/main/index.js";
import issuesExtension from "../../extensions/builtins/issues/main/index.js";
import subagentsExtension from "../../extensions/builtins/subagents/main/index.js";
import type { AnyMainExtensionDefinition } from "../../extensions/core/main/index.js";

export const installedMainExtensions = [
  subagentsExtension,
  appsExtension,
  issuesExtension,
] satisfies AnyMainExtensionDefinition[];
