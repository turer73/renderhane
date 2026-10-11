import { describe, expect, it } from "vitest";
import { nextPollDelay, type PolledJob } from "../use-job-polling";

const NOW = Date.parse("2026-10-11T12:00:00Z");
const MIN = 60_000;

function job(status: PolledJob["status"], ageMs: number, createdAt?: string): PolledJob {
  return {
    id: `${status}-${ageMs}`,
    tool: "image",
    status,
    credit_cost: 1,
    created_at: createdAt ?? new Date(NOW - ageMs).toISOString(),
    completed_at: null,
    error_message: null,
    output_id: null,
    output_url: null,
    output_type: null,
    source_image: null,
  };
}

describe("nextPollDelay", () => {
  it("does not poll without active jobs", () => {
    expect(nextPollDelay([], NOW)).toBeNull();
    expect(nextPollDelay([job("completed", 1 * MIN), job("failed", 2 * MIN)], NOW)).toBeNull();
  });

  it("polls every 2.5s for the first 10 minutes", () => {
    expect(nextPollDelay([job("pending", 0)], NOW)).toBe(2500);
    expect(nextPollDelay([job("processing", 9 * MIN)], NOW)).toBe(2500);
  });

  it("slows to 30s for long renders", () => {
    expect(nextPollDelay([job("processing", 10 * MIN)], NOW)).toBe(30_000);
    expect(nextPollDelay([job("processing", 119 * MIN)], NOW)).toBe(30_000);
  });

  it("stops once every active job is older than 2 hours", () => {
    expect(nextPollDelay([job("pending", 120 * MIN), job("processing", 24 * 60 * MIN)], NOW)).toBeNull();
  });

  it("follows the youngest active job", () => {
    expect(nextPollDelay([job("pending", 300 * MIN), job("processing", 1 * MIN)], NOW)).toBe(2500);
    expect(nextPollDelay([job("pending", 300 * MIN), job("processing", 20 * MIN)], NOW)).toBe(30_000);
  });

  it("treats unparseable or future timestamps as new", () => {
    expect(nextPollDelay([job("pending", 0, "not-a-date")], NOW)).toBe(2500);
    expect(nextPollDelay([job("pending", -5 * MIN)], NOW)).toBe(2500);
  });
});
