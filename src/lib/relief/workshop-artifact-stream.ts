import "server-only";
import { createHash } from "node:crypto";

/** Keep one chunk back: a bad final hash must not deliver Content-Length bytes. */
export function verifiedArtifactStream(body: ReadableStream<Uint8Array>, length: number, expectedHash: string) {
  const reader = body.getReader();
  const hash = createHash("sha256");
  let size = 0;
  let pending: Uint8Array | undefined;
  let released = false;
  const release = () => { if (!released) { released = true; reader.releaseLock(); } };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            if (size !== length || hash.digest("hex") !== expectedHash) throw new Error("integrity");
            if (pending) controller.enqueue(pending);
            controller.close(); release(); return;
          }
          size += value.byteLength;
          if (size > length) throw new Error("length");
          hash.update(value);
          const previous = pending;
          pending = value;
          if (previous) { controller.enqueue(previous); return; }
        }
      } catch {
        try { await reader.cancel(); } catch { /* preserve the sanitised error */ }
        release(); controller.error(new Error("worker_artifact_integrity_failed"));
      }
    },
    async cancel() {
      try { await reader.cancel(); } finally { release(); }
    },
  });
}
