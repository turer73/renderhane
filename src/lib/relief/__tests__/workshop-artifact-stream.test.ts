import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { verifiedArtifactStream } from "../workshop-artifact-stream";

function chunks(values: Uint8Array[], cancel = vi.fn()) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < values.length) controller.enqueue(values[index++]);
      else controller.close();
    }, cancel,
  });
}
const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

describe("authenticated artifact stream integrity", () => {
  it("streams a 12 MiB artifact byte-exactly without buffering the whole response", async () => {
    const value = Buffer.alloc(12 * 1024 * 1024, 37);
    const parts = Array.from({ length: 192 }, (_, i) => value.subarray(i * 65536, (i + 1) * 65536));
    const output = await new Response(verifiedArtifactStream(chunks(parts), value.length, digest(value))).arrayBuffer();
    expect(Buffer.from(output).equals(value)).toBe(true);
  });
  it.each([2, 4])("fails when the actual length differs from declared length %i", async (length) => {
    const value = Buffer.from("abc");
    const body = verifiedArtifactStream(chunks([value]), length, digest(value));
    await expect(new Response(body).arrayBuffer()).rejects.toThrow("worker_artifact_integrity_failed");
  });
  it("never delivers all declared bytes when the final hash is wrong", async () => {
    const body = verifiedArtifactStream(chunks([Buffer.from("ab"), Buffer.from("cd")]), 4, "0".repeat(64));
    const reader = body.getReader();
    const first = await reader.read();
    expect(first.value?.length).toBe(2);
    await expect(reader.read()).rejects.toThrow("worker_artifact_integrity_failed");
  });
  it("cancels the upstream reader on client cancellation", async () => {
    const cancel = vi.fn();
    const body = verifiedArtifactStream(chunks([Buffer.from("a"), Buffer.from("b"), Buffer.from("c")], cancel), 3, digest(Buffer.from("abc")));
    await body.cancel();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("sanitises upstream stream errors", async () => {
    const upstream = new ReadableStream<Uint8Array>({ pull() { throw new Error("private-host-or-path"); } });
    await expect(new Response(verifiedArtifactStream(upstream, 3, "a".repeat(64))).text()).rejects.toThrow("worker_artifact_integrity_failed");
  });
});
