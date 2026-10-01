import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production scheduler contract", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> };

  it("retains maintenance and adds the documented health/catalog schedules", () => {
    expect(config.crons).toEqual([
      { path: "/api/cron/stuck-jobs", schedule: "0 0 * * *" },
      { path: "/api/cron/subscription-renew", schedule: "0 6 * * *" },
      { path: "/api/cron/health", schedule: "0 */12 * * *" },
      { path: "/api/cron/fal-scanner", schedule: "0 9 * * 1" },
    ]);
  });

  it("does not duplicate the existing five-minute Klipper webhook drainer", () => {
    expect(config.crons.map((job) => job.path)).not.toContain("/api/cron/process-webhooks");
    expect(new Set(config.crons.map((job) => job.path)).size).toBe(config.crons.length);
  });
});
