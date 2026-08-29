import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createBoundedDownloadStream } from "../upload";

describe("createBoundedDownloadStream", () => {
  it("propagates a late upstream error to the bounded consumer", async () => {
    const response = new PassThrough();
    const bounded = createBoundedDownloadStream(response as never, 1024);
    bounded.resume();

    const failure = new Error("connection reset");
    const error = new Promise<Error>((resolve) => bounded.once("error", resolve));
    response.emit("error", failure);

    await expect(error).resolves.toBe(failure);
  });

  it("turns an upstream abort into a stream error", async () => {
    const response = new PassThrough();
    const bounded = createBoundedDownloadStream(response as never, 1024);
    bounded.resume();

    const error = new Promise<Error>((resolve) => bounded.once("error", resolve));
    response.emit("aborted");

    await expect(error).resolves.toMatchObject({
      message: "Upstream download was aborted",
    });
  });
});
