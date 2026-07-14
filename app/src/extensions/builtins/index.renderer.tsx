import type { RendererExtensionDefinition } from "../core/renderer";
import subagentsExtension from "./subagents/renderer";

export const installedRendererExtensions = [
  subagentsExtension,
] satisfies RendererExtensionDefinition[];
