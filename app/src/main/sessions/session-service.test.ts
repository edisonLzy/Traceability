import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { Entry } from "../../shared/session-ipc.js";
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
    const service = new SessionService(database);
    const firstSession = service.create("app-a");
    const otherSession = service.create("app-b");
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

    service.appendEntries(firstSession.id, entries);
    service.appendEntries(firstSession.id, entries);

    expect(service.list("app-a")).toHaveLength(1);
    expect(service.list("app-b")).toEqual([expect.objectContaining({ id: otherSession.id })]);
    expect(service.get(firstSession.id)).toEqual(
      expect.objectContaining({ id: firstSession.id, appId: "app-a", leafEntryId: "entry-2" }),
    );
    expect(service.getEntries(firstSession.id)).toEqual([
      expect.objectContaining({ id: "entry-1", parentId: null }),
      expect.objectContaining({ id: "entry-2", parentId: "entry-1" }),
    ]);

    database.close();
  });
});
