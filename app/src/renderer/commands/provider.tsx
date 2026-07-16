import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { DependencyList, ReactNode } from "react";

import { CommandRegistry } from "./registry";
import type { CommandDefinition, CommandPaletteController, CommandPaletteView } from "./types";

interface CommandContextValue extends CommandPaletteController {
  registry: CommandRegistry;
}

const CommandContext = createContext<CommandContextValue | null>(null);

export function CommandProvider({ children }: { children: ReactNode }) {
  const registryRef = useRef<CommandRegistry | null>(null);
  if (!registryRef.current) registryRef.current = new CommandRegistry();

  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<CommandPaletteView>("commands");

  const open = useCallback(() => {
    setView("commands");
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const openSessions = useCallback(() => {
    setView("sessions");
    setIsOpen(true);
  }, []);

  const value = useMemo<CommandContextValue>(
    () => ({ registry: registryRef.current!, isOpen, view, open, close, openSessions }),
    [close, isOpen, open, openSessions, view],
  );

  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>;
}

export function useCommandPalette(): CommandPaletteController {
  const context = useCommandContext();
  return context;
}

export function useRegisteredCommands(): readonly CommandDefinition[] {
  const { registry } = useCommandContext();
  return useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
}

/** Register commands for as long as the calling React subtree is mounted. */
export function useRegisterCommands(
  factory: () => readonly CommandDefinition[],
  deps: DependencyList,
) {
  const { registry } = useCommandContext();
  const commands = useMemo(factory, deps);

  useEffect(() => registry.register(commands), [commands, registry]);
}

function useCommandContext(): CommandContextValue {
  const context = useContext(CommandContext);
  if (!context) {
    throw new Error("Command hooks must be used within a CommandProvider");
  }
  return context;
}
