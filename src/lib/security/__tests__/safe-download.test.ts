import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import {
  ByteLimitTransform,
  DownloadTooLargeError,
  isPublicIpAddress,
} from "../safe-download";

describe("safe download address classification", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ])("rejects non-public address %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111", "2001:4860:4860::8888"])(
    "accepts public address %s",
    (address) => {
      expect(isPublicIpAddress(address)).toBe(true);
    }
  );
});

describe("ByteLimitTransform", () => {
  it("passes a body at the configured limit", async () => {
    const input = new PassThrough();
    const limiter = input.pipe(new ByteLimitTransform(5));
    const chunks: Buffer[] = [];
    limiter.on("data", (chunk) => chunks.push(chunk));

    input.end("12345");
    await new Promise<void>((resolve, reject) => {
      limiter.on("end", resolve);
      limiter.on("error", reject);
    });

    expect(Buffer.concat(chunks).toString()).toBe("12345");
    expect(limiter.bytesRead).toBe(5);
  });

  it("aborts a body that crosses the configured limit", async () => {
    const input = new PassThrough();
    const limiter = input.pipe(new ByteLimitTransform(4));
    limiter.resume();
    input.end("12345");

    await expect(new Promise<void>((resolve, reject) => {
      limiter.on("end", resolve);
      limiter.on("error", reject);
    })).rejects.toBeInstanceOf(DownloadTooLargeError);
  });
});
