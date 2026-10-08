import { afterEach, describe, expect, it, vi } from "vitest";
import { createRenderhaneAdapter } from "../api-adapter";
import { DEMO_UPLOAD_MAX_BYTES } from "@/lib/media/demo-image-limits";

/** Node has no FileReader; this one reads like the browser's readAsDataURL. */
class TestFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  abort() {}
  readAsDataURL(file: Blob) {
    void file.arrayBuffer().then((buffer) => {
      this.result = `data:${file.type};base64,${Buffer.from(buffer).toString("base64")}`;
      this.onload?.();
      this.onloadend?.();
    });
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("free tool background-removal adapter", () => {
  it("never sends a file above the tool's upload limit", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array(DEMO_UPLOAD_MAX_BYTES + 1)], "photo.jpg", { type: "image/jpeg" });

    await expect(createRenderhaneAdapter("en").removeBackground!(file, new AbortController().signal))
      .rejects.toThrow("The photo is too large for this tool.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a prepared photo at the limit as one data URL", async () => {
    vi.stubGlobal("FileReader", TestFileReader);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ resultUrl: "https://v3.fal.media/files/cutout.png", remaining: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array(DEMO_UPLOAD_MAX_BYTES)], "photo.jpg", { type: "image/jpeg" });

    const result = await createRenderhaneAdapter("tr").removeBackground!(file, new AbortController().signal);

    expect(result).toEqual({ url: "https://v3.fal.media/files/cutout.png", remaining: 1 });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init.body).length).toBeLessThan(4_500_000); // Vercel's 4.5 MB request body limit
  });
});
