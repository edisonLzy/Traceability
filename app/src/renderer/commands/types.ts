import type { LucideIcon } from "lucide-react";

export interface CommandGroup {
  id: string;
  label: string;
  order?: number;
}

export interface CommandDefinition {
  /** Stable, globally unique ID used by the registry and cmdk. */
  id: string;
  group: CommandGroup;
  title: string;
  description?: string;
  icon?: LucideIcon;
  keywords?: string[];
  shortcut?: string;
  order?: number;
  disabled?: boolean;
  /** Close the root command view after selection. Defaults to true. */
  closeOnSelect?: boolean;
  /** Defined at the registration site, so it can capture local React state. */
  action: () => void | Promise<void>;
}

export type CommandPaletteView = "commands" | "sessions";

export interface CommandPaletteController {
  readonly isOpen: boolean;
  readonly view: CommandPaletteView;
  open(): void;
  close(): void;
  openSessions(): void;
}
