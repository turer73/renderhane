import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type LockPackage = {
  version?: string;
  integrity?: string;
  dependencies?: Record<string, string>;
};

describe("cross-platform dependency lock", () => {
  it("resolves the optional WASI binding's exact EMNAPI dependencies", () => {
    const lock = JSON.parse(
      readFileSync(new URL("../../../package-lock.json", import.meta.url), "utf8"),
    ) as { packages: Record<string, LockPackage> };
    const parent = "node_modules/@rolldown/binding-wasm32-wasi";
    expect(lock.packages[parent]).toBeDefined();

    // npm 11 can prune this inactive CPU branch on Windows. npm 10 still
    // validates it during npm ci, even when the runner is not wasm32.
    for (const dependency of ["@emnapi/core", "@emnapi/runtime"]) {
      const requested = lock.packages[parent].dependencies?.[dependency];
      expect(requested).toMatch(/^\d+\.\d+\.\d+$/);
      const resolved = lock.packages[parent + "/node_modules/" + dependency]
        ?? lock.packages["node_modules/" + dependency];
      expect(resolved?.version, dependency).toBe(requested);
      expect(resolved?.integrity).toMatch(/^sha512-/);
    }
  });
});
