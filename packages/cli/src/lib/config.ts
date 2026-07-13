import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CliConfig {
  server: string;
  token: string;
}

const CONFIG_DIR = join(homedir(), ".traceability");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function getConfig(): CliConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`No config found. Run: traceability config set --server <url> --token <token>`);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as CliConfig;
}

export function saveConfig(cfg: CliConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
