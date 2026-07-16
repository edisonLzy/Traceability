import type { CommandDefinition } from "./types";

type RegisteredCommand = CommandDefinition & {
  sequence: number;
  token: symbol;
};

const noop = () => undefined;

/**
 * In-memory external store for the commands contributed by mounted React
 * subtrees. It deliberately owns metadata only; command actions remain the
 * closures supplied by each registration site.
 */
export class CommandRegistry {
  private readonly commands = new Map<string, RegisteredCommand>();
  private readonly listeners = new Set<() => void>();
  private snapshot: readonly CommandDefinition[] = [];
  private sequence = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): readonly CommandDefinition[] => this.snapshot;

  register(commands: readonly CommandDefinition[]): () => void {
    const validationError = this.validate(commands);
    if (validationError) return this.handleRegistrationFailure(validationError);
    if (commands.length === 0) return noop;

    const token = Symbol("command-registration");
    for (const command of commands) {
      this.commands.set(command.id, { ...command, sequence: this.sequence++, token });
    }
    this.rebuildSnapshot();
    this.emit();

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;

      let changed = false;
      for (const command of commands) {
        if (this.commands.get(command.id)?.token !== token) continue;
        this.commands.delete(command.id);
        changed = true;
      }
      if (!changed) return;

      this.rebuildSnapshot();
      this.emit();
    };
  }

  private validate(commands: readonly CommandDefinition[]): string | undefined {
    const ids = new Set<string>();
    for (const command of commands) {
      if (!command.id.trim()) return "Command ID cannot be empty";
      if (!command.title.trim()) return `Command "${command.id}" must have a title`;
      if (!command.group.id.trim() || !command.group.label.trim()) {
        return `Command "${command.id}" must have a group ID and label`;
      }
      if (ids.has(command.id)) return `Duplicate command ID in registration: ${command.id}`;
      if (this.commands.has(command.id)) return `Command ID is already registered: ${command.id}`;
      ids.add(command.id);
    }
    return undefined;
  }

  private handleRegistrationFailure(message: string): () => void {
    if (import.meta.env.DEV) throw new Error(message);
    console.error(`[CommandRegistry] ${message}`);
    return noop;
  }

  private rebuildSnapshot() {
    this.snapshot = Array.from(this.commands.values()).sort(compareCommands);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

function compareCommands(a: RegisteredCommand, b: RegisteredCommand) {
  const groupOrder = (a.group.order ?? 0) - (b.group.order ?? 0);
  if (groupOrder !== 0) return groupOrder;

  const groupId = a.group.id.localeCompare(b.group.id);
  if (groupId !== 0) return groupId;

  const commandOrder = (a.order ?? 0) - (b.order ?? 0);
  if (commandOrder !== 0) return commandOrder;

  return a.sequence - b.sequence;
}
