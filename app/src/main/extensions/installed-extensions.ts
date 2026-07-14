import subagentsExtension from "../../extensions/builtins/subagents/main/index.js";
import type { AnyMainExtensionDefinition } from "../../extensions/core/main/index.js";

export const installedMainExtensions = [subagentsExtension] satisfies AnyMainExtensionDefinition[];
