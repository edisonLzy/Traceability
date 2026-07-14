import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BrowserWindow } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";

const { ipcMain } = vi.hoisted(() => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock("electron", () => ({ ipcMain }));

import type { Entry, Session } from "../../shared/session-ipc.js";
import { LocalDatabase } from "../db/database.js";
import { SessionService } from "./session-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("SessionService", () => {
  it("creates app-isolated sessions and persists each entry once", async () => {
    const directory = await mkdtemp(join(tmpdir(), "traceability-session-"));
    temporaryDirectories.push(directory);
    const database = new LocalDatabase(join(directory, "agent.sqlite"));
    const service = new SessionService(database, {} as BrowserWindow);
    const createRegistration = ipcMain.handle.mock.calls.find(
      ([channel]) => channel === "sessions:create",
    );
    const createFromIpc = createRegistration?.[1] as
      | ((event: unknown, appId: string) => Promise<Session>)
      | undefined;
    expect(createFromIpc).toBeDefined();

    const firstSession = await createFromIpc!({}, "app-a");
    const otherSession = await service.create("app-b");
    const entries: Entry[] = [
      {
        id: "entry-1",
        sessionId: firstSession.id,
        parentId: null,
        type: "message",
        timestamp: 1,
        data: { role: "user", content: "Investigate this issue" },
      },
      {
        id: "entry-2",
        sessionId: firstSession.id,
        parentId: "entry-1",
        type: "model_change",
        timestamp: 2,
        data: { providerId: "openai", modelId: "gpt-5" },
      },
    ];

    await service.appendEntries(firstSession.id, entries);
    await service.appendEntries(firstSession.id, entries);

    expect(await service.list("app-a")).toHaveLength(1);
    expect(await service.list("app-b")).toEqual([expect.objectContaining({ id: otherSession.id })]);
    expect(await service.get(firstSession.id)).toEqual(
      expect.objectContaining({ id: firstSession.id, appId: "app-a", leafEntryId: "entry-2" }),
    );
    expect(await service.getEntries(firstSession.id)).toEqual([
      expect.objectContaining({ id: "entry-1", parentId: null }),
      expect.objectContaining({ id: "entry-2", parentId: "entry-1" }),
    ]);
    expect(ipcMain.handle).toHaveBeenCalledTimes(7);

    service.destroy();
    database.close();
  });
});
