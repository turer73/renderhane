import { describe, expect, it, vi } from "vitest";
import {
  LAB_INPUT_LINK_TTL_SECONDS,
  labInputPath,
  resignLabUploads,
  signedUploadPath,
  uploadLabInput,
  type LabStorageClient,
} from "../model-lab-uploads";

const SUPABASE = "https://proj.supabase.co";
const signed = (path: string, token = "old") => `${SUPABASE}/storage/v1/object/sign/uploads/${path}?token=${token}`;

function fakeStorage(options: { uploadError?: boolean; signError?: boolean; missing?: string[]; throws?: boolean } = {}) {
  const calls = { uploads: [] as string[], signs: [] as Array<{ paths: string[]; ttl: number }> };
  const client: LabStorageClient = {
    storage: {
      from(bucket: string) {
        expect(bucket).toBe("uploads");
        return {
          async upload(path: string) {
            if (options.throws) throw new Error("network");
            calls.uploads.push(path);
            return { error: options.uploadError ? { message: "denied" } : null };
          },
          async createSignedUrls(paths: string[], ttl: number) {
            calls.signs.push({ paths, ttl });
            if (options.signError) return { data: null, error: { message: "sign failed" } };
            return {
              data: paths.map((path) => options.missing?.includes(path)
                ? { path, signedUrl: null, error: "Object not found" }
                : { path, signedUrl: signed(path, "fresh"), error: null }),
              error: null,
            };
          },
        };
      },
    },
  };
  return { client, calls };
}

describe("Model Lab input uploads", () => {
  it("keeps uploads in the admin's own lab folder with a safe, unique name", () => {
    const path = labInputPath("admin-a", "../ürün foto (1).PNG", 1700000000000, "1234abcd-0000-4000-8000-000000000000");
    expect(path).toBe("admin-a/model-lab/inputs/1700000000000-1234abcd-__r_n_foto__1_.PNG");
    expect(labInputPath("admin-a", "...", 1, "ffffffff-0000")).toBe("admin-a/model-lab/inputs/1-ffffffff-image");
    expect(labInputPath("admin-a", "x".repeat(300), 1, "a").length).toBeLessThan(140);
  });

  it("recognises only this project's signed upload links", () => {
    expect(signedUploadPath(signed("admin-a/model-lab/inputs/1-a.png"), SUPABASE)).toBe("admin-a/model-lab/inputs/1-a.png");
    expect(signedUploadPath(signed("admin-a/model-lab/inputs/1%20a.png"), SUPABASE)).toBe("admin-a/model-lab/inputs/1 a.png");
    expect(signedUploadPath("https://other.supabase.co/storage/v1/object/sign/uploads/admin-a/x.png?token=t", SUPABASE)).toBeNull();
    expect(signedUploadPath(`${SUPABASE}/storage/v1/object/public/uploads/admin-a/x.png`, SUPABASE)).toBeNull();
    expect(signedUploadPath("not a url", SUPABASE)).toBeNull();
    expect(signedUploadPath(signed("admin-a/x.png"), undefined)).toBeNull();
  });

  it("uploads the prepared file and returns a short-lived signed link", async () => {
    const { client, calls } = fakeStorage();
    const file = new File([new Uint8Array([1, 2, 3])], "shoe.png", { type: "image/png" });
    const result = await uploadLabInput(client, "admin-a", file);
    expect(result?.path).toMatch(/^admin-a\/model-lab\/inputs\/\d+-[0-9a-f]{8}-shoe\.png$/);
    expect(result?.url).toBe(signed(result!.path, "fresh"));
    expect(calls.signs).toEqual([{ paths: [result!.path], ttl: LAB_INPUT_LINK_TTL_SECONDS }]);
  });

  it.each([{ uploadError: true }, { signError: true }, { throws: true }])("reports a failed upload as null: %j", async (failure) => {
    const { client } = fakeStorage(failure);
    expect(await uploadLabInput(client, "admin-a", new File(["x"], "a.png", { type: "image/png" }))).toBeNull();
  });

  it("signs every own upload again right before sending, leaving other values alone", async () => {
    const { client, calls } = fakeStorage();
    const values = {
      image_urls: `${signed("admin-a/model-lab/inputs/1-a.png")}\n https://cdn.example/b.png \n${signed("admin-a/model-lab/inputs/2-b.png")}`,
      prompt: "make it red",
      mask_url: signed("admin-a/model-lab/inputs/1-a.png"),
      empty: "",
    };
    const result = await resignLabUploads(client, values, SUPABASE);
    expect(result).toEqual({
      values: {
        image_urls: `${signed("admin-a/model-lab/inputs/1-a.png", "fresh")}\nhttps://cdn.example/b.png\n${signed("admin-a/model-lab/inputs/2-b.png", "fresh")}`,
        prompt: "make it red",
        mask_url: signed("admin-a/model-lab/inputs/1-a.png", "fresh"),
        empty: "",
      },
      missing: [],
    });
    // One call for all paths, each path once.
    expect(calls.signs).toEqual([{ paths: ["admin-a/model-lab/inputs/1-a.png", "admin-a/model-lab/inputs/2-b.png"], ttl: LAB_INPUT_LINK_TTL_SECONDS }]);
  });

  it("names the fields whose file is gone and fails closed when signing fails", async () => {
    const gone = fakeStorage({ missing: ["admin-a/model-lab/inputs/2-b.png"] });
    const result = await resignLabUploads(gone.client, {
      image_url: signed("admin-a/model-lab/inputs/1-a.png"),
      mask_url: signed("admin-a/model-lab/inputs/2-b.png"),
    }, SUPABASE);
    expect(result?.missing).toEqual(["mask_url"]);
    expect((await resignLabUploads(fakeStorage({ signError: true }).client, { image_url: signed("admin-a/x.png") }, SUPABASE))).toBeNull();
  });

  it("does not call storage when no value is an own upload", async () => {
    const { client, calls } = fakeStorage();
    const spy = vi.spyOn(client.storage, "from");
    expect(await resignLabUploads(client, { image_url: "https://cdn.example/a.png" }, SUPABASE)).toEqual({ values: { image_url: "https://cdn.example/a.png" }, missing: [] });
    expect(spy).not.toHaveBeenCalled();
    expect(calls.signs).toEqual([]);
  });
});
