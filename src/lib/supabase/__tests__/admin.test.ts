import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createAdminClient } from "../admin";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("request-scoped service client", () => {
  it("sends the same abort signal to Storage and database fetches without network access", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    const transport = vi.fn().mockImplementation(async () => new Response("[]", { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", transport);
    const controller = new AbortController();
    const client = createAdminClient(controller.signal);
    await client.storage.from("uploads").upload("owner/test.png", new Uint8Array([1]));
    await client.from("model_lab_runs").select("id");
    expect(transport).toHaveBeenCalledTimes(2);
    for (const [, options] of transport.mock.calls) expect(options.signal).toBe(controller.signal);
    controller.abort();
    await client.from("model_lab_runs").select("id");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(createAdminClient(new AbortController().signal)).not.toBe(client);
  });
});
