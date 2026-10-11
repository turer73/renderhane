import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkProjectOwnership, projectCheckResponse } from "../project-ownership";

const PROJECT = "3f2b8c1e-9a4d-4c7e-8b21-5d6f7a8b9c0d";

function client(result: { data: unknown; error: unknown }) {
  const filters: unknown[][] = [];
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((...args: unknown[]) => { filters.push(args); return query; }),
    maybeSingle: vi.fn(async () => result),
  };
  return { supabase: { from: vi.fn(() => query) } as unknown as SupabaseClient, filters };
}

describe("checkProjectOwnership", () => {
  it("accepts the caller's own project, filtered by user", async () => {
    const { supabase, filters } = client({ data: { id: PROJECT }, error: null });
    expect(await checkProjectOwnership(supabase, PROJECT, "user-1")).toBe("ok");
    expect(filters).toEqual([["id", PROJECT], ["user_id", "user-1"]]);
  });

  it("reports someone else's or a missing project as not found", async () => {
    const { supabase } = client({ data: null, error: null });
    expect(await checkProjectOwnership(supabase, PROJECT, "user-1")).toBe("not_found");
    expect(projectCheckResponse("not_found").status).toBe(404);
  });

  it.each([42, "not-a-uuid", "", null])("rejects a malformed projectId %s without querying", async (projectId) => {
    const { supabase } = client({ data: null, error: null });
    expect(await checkProjectOwnership(supabase, projectId, "user-1")).toBe("invalid");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("does not guess when the lookup fails", async () => {
    const { supabase } = client({ data: null, error: { message: "down" } });
    expect(await checkProjectOwnership(supabase, PROJECT, "user-1")).toBe("unavailable");
    expect(projectCheckResponse("unavailable").status).toBe(503);
  });
});
