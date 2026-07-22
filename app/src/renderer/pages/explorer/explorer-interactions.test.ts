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

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve: resolve!, reject: reject! };
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

  it("reports the recording transition to the page and ignores repeated starts while pending", async () => {
    const order: string[] = [];
    const start = deferred<{ recordingId: string }>();
    const transitionChanges: boolean[] = [];
    const dependencies = {
      ...createDependencies(order),
      startRecording: vi.fn(() => {
        order.push("main:start");
        return start.promise;
      }),
      onTransitionChange: (isTransitioning: boolean) => transitionChanges.push(isTransitioning),
    } satisfies ExplorerInteractionDependencies;
    const coordinator = new ExplorerInteractionCoordinator(dependencies);

    const firstStart = coordinator.startRecording();
    const repeatedStart = coordinator.startRecording();

    expect(order).toEqual(["main:start"]);
    expect(transitionChanges).toEqual([true]);

    start.resolve({ recordingId: "recording-1" });
    await Promise.all([firstStart, repeatedStart]);

    expect(order).toEqual(["main:start", "guest:set-recording:true"]);
    expect(transitionChanges).toEqual([true, false]);
    expect(coordinator.isRecording).toBe(true);
  });

  it("ignores repeated stops while pending and logs one recording after completion", async () => {
    const order: string[] = [];
    const stop = deferred<BrowserRecording>();
    const transitionChanges: boolean[] = [];
    const dependencies = {
      ...createDependencies(order),
      stopRecording: vi.fn(() => {
        order.push("main:stop");
        return stop.promise;
      }),
      onTransitionChange: (isTransitioning: boolean) => transitionChanges.push(isTransitioning),
    } satisfies ExplorerInteractionDependencies;
    const coordinator = new ExplorerInteractionCoordinator(dependencies);

    const firstStop = coordinator.stopRecording();
    const repeatedStop = coordinator.stopRecording();

    expect(order).toEqual(["guest:set-recording:false", "main:stop"]);
    expect(transitionChanges).toEqual([true]);

    stop.resolve(recording);
    await firstStop;
    await repeatedStop;

    expect(transitionChanges).toEqual([true, false]);
    expect(dependencies.info).toHaveBeenCalledTimes(1);
    expect(dependencies.info).toHaveBeenCalledWith(
      "[traceability:explorer-recording]",
      JSON.stringify(recording, null, 2),
    );
    expect(coordinator.isRecording).toBe(false);
  });

  it("releases the transition guard after a failed start so the user can retry", async () => {
    const dependencies = createDependencies();
    const startRecording = vi
      .fn<ExplorerInteractionDependencies["startRecording"]>()
      .mockRejectedValueOnce(new Error("start failed"))
      .mockResolvedValueOnce({ recordingId: "recording-1" });
    dependencies.startRecording = startRecording;
    const coordinator = new ExplorerInteractionCoordinator(dependencies);

    await expect(coordinator.startRecording()).rejects.toThrow("start failed");
    await coordinator.startRecording();

    expect(startRecording).toHaveBeenCalledTimes(2);
    expect(dependencies.send).toHaveBeenCalledTimes(1);
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
