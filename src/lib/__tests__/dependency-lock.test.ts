import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type LockPackage = {
  version?: string;
  integrity?: string;
  inBundle?: boolean;
  dependencies?: Record<string, string>;
  bundleDependencies?: string[];
};

const EMNAPI = ["@emnapi/core", "@emnapi/runtime"];

describe("cross-platform dependency lock", () => {
  it("resolves every optional WASI binding's exact EMNAPI dependencies", () => {
    const lock = JSON.parse(
      readFileSync(new URL("../../../package-lock.json", import.meta.url), "utf8"),
    ) as { packages: Record<string, LockPackage> };

    // npm 11 can prune these inactive CPU branches on Windows. npm 10 still
    // validates them during npm ci, even when the runner is not wasm32.
    // rolldown >=1.2 no longer ships a WASI binding, so check whichever
    // bindings the lock actually carries instead of naming one package.
    // Bundled dependencies ship inside the parent tarball and carry no
    // integrity of their own, so only registry-resolved ones are checked.
    const parents = Object.keys(lock.packages).filter((key) =>
      key.endsWith("-wasm32-wasi"),
    );
    expect(parents.length).toBeGreaterThan(0);

    for (const parent of parents) {
      const bundled = new Set(lock.packages[parent].bundleDependencies ?? []);
      for (const dependency of EMNAPI) {
        const requested = lock.packages[parent].dependencies?.[dependency];
        if (!requested || bundled.has(dependency)) continue;
        const resolved =
          lock.packages[`${parent}/node_modules/${dependency}`] ??
          lock.packages[`node_modules/${dependency}`];
        expect(resolved?.version, `${parent} -> ${dependency}`).toBeDefined();
        if (/^\d+\.\d+\.\d+$/.test(requested)) {
          expect(resolved?.version, `${parent} -> ${dependency}`).toBe(requested);
        }
        expect(resolved?.integrity).toMatch(/^sha512-/);
      }
    }
  });
});
