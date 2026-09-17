import { describe, expect, it } from "vitest";
import {
  forgetPendingIdempotencyKey,
  getPendingIdempotencyKey,
  rememberPendingIdempotencyKey,
} from "../social-kit-pending";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("Social Kit browser retry key persistence", () => {
  it("survives remounts while remaining scoped by user and semantic locale/input", () => {
    const storage = new MemoryStorage();
    const scope = `tr:${"a".repeat(64)}`;

    rememberPendingIdempotencyKey(storage, "user-1", scope, "request-key-1");

    expect(getPendingIdempotencyKey(storage, "user-1", scope)).toBe(
      "request-key-1"
    );
    expect(
      getPendingIdempotencyKey(storage, "user-1", `en:${"a".repeat(64)}`)
    ).toBeNull();
    expect(getPendingIdempotencyKey(storage, "user-2", scope)).toBeNull();
  });

  it("stores no file, blob, or signed URL capability", () => {
    const storage = new MemoryStorage();
    rememberPendingIdempotencyKey(
      storage,
      "user-1",
      `tr:${"b".repeat(64)}`,
      "request-key-2"
    );

    const serialized = storage.getItem("renderhane:social-kit:v2:user-1");
    expect(serialized).toContain("request-key-2");
    expect(serialized).not.toContain("http");
    expect(serialized).not.toContain("signed");
  });

  it("forgets only the exact durable key after a final response", () => {
    const storage = new MemoryStorage();
    const scope = `tr:${"c".repeat(64)}`;
    rememberPendingIdempotencyKey(storage, "user-1", scope, "request-key-3");

    forgetPendingIdempotencyKey(storage, "user-1", scope, "different-key");
    expect(getPendingIdempotencyKey(storage, "user-1", scope)).toBe(
      "request-key-3"
    );

    forgetPendingIdempotencyKey(storage, "user-1", scope, "request-key-3");
    expect(getPendingIdempotencyKey(storage, "user-1", scope)).toBeNull();
  });
});
