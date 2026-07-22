import type { BrowserElementSummary, BrowserRecording } from "@shared/browser-types";
import { describe, expect, it, vi } from "vitest";

import {
  ExplorerInteractionCoordinator,
  type ExplorerInteractionDependencies,
} from "./explorer-interactions";

const element: BrowserElementSummary = {
  tagName: "button",
  role: "button",
  name: "Save",
  selector: "[data-testid=save]",
  text: "Save",
};

const recording: BrowserRecording = {
  version: 1,
  id: "recording-1",
  startedAt: "2026-07-22T10:00:00.000Z",
  endedAt: "2026-07-22T10:01:00.000Z",
  url: "http://localhost:4173/",
  operations: [],
  network: [],
  console: [],
  memory: {
    metric: "JSHeapUsedSize",
    samples: [],
    initialBytes: 1,
    finalBytes: 1,
    deltaBytes: 0,
  },
  captureErrors: [],
};

function createDependencies(order: string[] = []): ExplorerInteractionDependencies {
  return {
    startRecording: vi.fn(async () => {
      order.push("main:start");
      return { recordingId: "recording-1" };
    }),
    stopRecording: vi.fn(async () => {
      order.push("main:stop");
      return recording;
    }),
    unregisterGuest: vi.fn(async () => {
      order.push("main:unregister");
    }),
    send: vi.fn((command) => {
      order.push(`guest:${command.type}:${"enabled" in command ? command.enabled : ""}`);
    }),
    createId: () => "comment-1",
    now: () => new Date("2026-07-22T10:02:00.000Z"),
    info: vi.fn(),
  };
}

describe("ExplorerInteractionCoordinator", () => {
  it("starts main capture before enabling guest operation capture", async () => {
    const order: string[] = [];
    const coordinator = new ExplorerInteractionCoordinator(createDependencies(order));

    await coordinator.startRecording();

    expect(order).toEqual(["main:start", "guest:set-recording:true"]);
    expect(coordinator.isRecording).toBe(true);
  });

  it("disables guest capture before stopping main capture and logs one recording", async () => {
    const order: string[] = [];
    const dependencies = createDependencies(order);
    const coordinator = new ExplorerInteractionCoordinator(dependencies);

    await coordinator.stopRecording();

    expect(order).toEqual(["guest:set-recording:false", "main:stop"]);
    expect(dependencies.info).toHaveBeenCalledTimes(1);
    expect(dependencies.info).toHaveBeenCalledWith(
      "[traceability:explorer-recording]",
      JSON.stringify(recording, null, 2),
    );
    expect(coordinator.isRecording).toBe(false);
  });

  it("opens an in-memory comment for a selected element", () => {
    const coordinator = new ExplorerInteractionCoordinator(createDependencies());

    coordinator.receiveGuestMessage({
      type: "element-selected",
      element,
      url: "http://localhost:4173/",
    });

    expect(coordinator.selectedElement).toEqual({
      type: "element-selected",
      element,
      url: "http://localhost:4173/",
    });
  });

  it("logs a submitted comment without invoking persistence", () => {
    const dependencies = createDependencies();
    const coordinator = new ExplorerInteractionCoordinator(dependencies);
    coordinator.receiveGuestMessage({
      type: "element-selected",
      element,
      url: "http://localhost:4173/",
    });

    const comment = coordinator.submitComment("  Check the saved state.  ");

    expect(comment).toEqual({
      id: "comment-1",
      createdAt: "2026-07-22T10:02:00.000Z",
      url: "http://localhost:4173/",
      element,
      comment: "Check the saved state.",
    });
    expect(dependencies.info).toHaveBeenCalledTimes(1);
    expect(dependencies.info).toHaveBeenCalledWith(
      "[traceability:explorer-comment]",
      JSON.stringify(comment, null, 2),
    );
    expect(coordinator.selectedElement).toBeNull();
  });

  it("unregisters the guest once on unmount", async () => {
    const dependencies = createDependencies();
    const coordinator = new ExplorerInteractionCoordinator(dependencies);

    await coordinator.unmount();
    await coordinator.unmount();

    expect(dependencies.unregisterGuest).toHaveBeenCalledTimes(1);
  });
});
