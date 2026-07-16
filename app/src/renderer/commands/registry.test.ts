import { describe, expect, it, vi } from "vitest";

import { CommandRegistry } from "./registry";
import type { CommandDefinition } from "./types";

function command(overrides: Partial<CommandDefinition> = {}): CommandDefinition {
  return {
    id: "command.default",
    group: { id: "general", label: "General" },
    title: "Default command",
    action: () => undefined,
    ...overrides,
  };
}

describe("CommandRegistry", () => {
  it("publishes one sorted snapshot per registration lifecycle", () => {
    const registry = new CommandRegistry();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);

    const dispose = registry.register([
      command({
        id: "navigation.issues",
        group: { id: "navigation", label: "Navigation", order: 20 },
        title: "Go to Issues",
      }),
      command({
        id: "monitor.refresh",
        group: { id: "monitor", label: "Monitor", order: 10 },
        title: "Refresh monitoring data",
      }),
    ]);

    expect(registry.getSnapshot().map((item) => item.id)).toEqual([
      "monitor.refresh",
      "navigation.issues",
    ]);
    expect(listener).toHaveBeenCalledTimes(1);

    dispose();
    dispose();
    expect(registry.getSnapshot()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("rejects duplicate IDs without partially registering a batch", () => {
    const registry = new CommandRegistry();
    registry.register([command({ id: "navigation.issues" })]);

    expect(() =>
      registry.register([command({ id: "monitor.refresh" }), command({ id: "navigation.issues" })]),
    ).toThrow("Command ID is already registered: navigation.issues");

    expect(registry.getSnapshot().map((item) => item.id)).toEqual(["navigation.issues"]);
  });

  it("rejects duplicate IDs within one registration", () => {
    const registry = new CommandRegistry();

    expect(() =>
      registry.register([command({ id: "monitor.refresh" }), command({ id: "monitor.refresh" })]),
    ).toThrow("Duplicate command ID in registration: monitor.refresh");

    expect(registry.getSnapshot()).toEqual([]);
  });
});
