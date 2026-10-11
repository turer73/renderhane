import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  checkImageCount,
  issueMessage,
  limitsSummary,
  limitsSummaryTr,
  positionedIssue,
  unreachableImageIssue,
} from "../image-limit-check";
import { ImagePreflightError, imagePreflightErrorBody } from "../image-preflight";
import type { ImageInputLimits } from "../image-formats";

describe("bilingual image copy", () => {
  it("names the image in both locales when a request holds several", () => {
    const issue = positionedIssue("corrupt", { index: 1, count: 3 }, "Bozuk.", "Damaged.");
    expect(issue.message).toBe("2. görsel: Bozuk.");
    expect(issue.messageEn).toBe("Image 2: Damaged.");
  });

  it("reads English only on /en and falls back to Turkish without a translation", () => {
    const issue = unreachableImageIssue(null);
    expect(issueMessage(issue, "en")).toMatch(/^The image could not be reached/);
    expect(issueMessage(issue, "tr")).toBe(issue.message);
    expect(issueMessage({ message: "Yalnız Türkçe" }, "en")).toBe("Yalnız Türkçe");
  });

  it("summarises limits in English and keeps the Turkish wrapper unchanged", () => {
    const limits = { formats: ["jpeg", "png"], maxBytes: 10_000_000, minDimension: 64, maxDimension: 4096, maxImages: 4 } as unknown as ImageInputLimits;
    expect(limitsSummary(limits, "en")).toBe("JPEG or PNG · up to 10 MB · 64–4096 pixels · up to 4 images");
    expect(limitsSummaryTr(limits)).toBe(limitsSummary(limits, "tr"));
    expect(limitsSummaryTr(limits)).toContain("veya");
  });

  it("carries the English message through the 422 body", () => {
    const issue = checkImageCount(5, { maxImages: 4, minImages: 1 } as unknown as ImageInputLimits)!;
    const body = imagePreflightErrorBody(new ImagePreflightError([issue]));
    expect(body.error).toBe(issue.message);
    expect(body.issues[0]).toMatchObject({ message: issue.message, messageEn: "You can select up to 4 images (selected: 5)." });
  });
});
