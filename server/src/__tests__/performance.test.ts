import "./test-db.js";
import { describe, it, expect } from "vitest";

import { createApp } from "../domains/apps/service.js";
import { recordMetrics, getPerformanceSummary } from "../domains/performance/service.js";

describe("performance", () => {
  it("aggregates metric samples by application with average and p75", () => {
    const app = createApp({ name: "Portal", repoUrl: "git@x:portal.git", defaultBranch: "main" });
    createApp({ name: "No samples", repoUrl: "git@x:empty.git", defaultBranch: "main" });

    expect(
      recordMetrics(app.id, {
        metrics: [
          { name: "FCP", value: 100, unit: "millisecond" },
          { name: "FCP", value: 200, unit: "millisecond" },
          { name: "FCP", value: 300, unit: "millisecond" },
          { name: "CLS", value: 0.1, unit: "score" },
        ],
      }),
    ).toEqual({ accepted: 4 });

    const summary = getPerformanceSummary({ hours: 1 });
    const portal = summary.apps.find((a) => a.appId === app.id)!;
    expect(portal.metrics.FCP).toMatchObject({
      count: 3,
      average: 200,
      p75: 300,
      unit: "millisecond",
    });
  });
});
