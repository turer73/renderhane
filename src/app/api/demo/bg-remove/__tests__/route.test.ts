import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), rateLimit: vi.fn(), insert: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({ getAIProvider: () => ({ subscribe: mocks.subscribe }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ insert: mocks.insert }) }) }));

import { POST } from "../route";
import { DEMO_UPLOAD_MAX_BYTES } from "@/lib/media/demo-image-limits";
import { png } from "@/lib/media/__tests__/image-fixtures";
import { realImage } from "@/lib/media/__tests__/real-images";

const dataUrl = (bytes: Uint8Array, mime = "image/png") => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
function send(imageDataUrl: string) {
  return POST(new NextRequest("https://renderhane.com/api/demo/bg-remove", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7" },
    body: JSON.stringify({ imageDataUrl }),
  }));
}

describe("POST /api/demo/bg-remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ success: true, remaining: 2 });
    mocks.subscribe.mockResolvedValue({ data: { image: { url: "https://v3.fal.media/files/cutout.png" } } });
  });

  it("sends a photo that decodes and fits the tool to the provider", async () => {
    const photo = dataUrl(await realImage("jpeg", 800, 600), "image/jpeg");

    const response = await send(photo);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ resultUrl: "https://v3.fal.media/files/cutout.png", remaining: 2 });
    expect(mocks.subscribe).toHaveBeenCalledWith("fal-ai/birefnet/v2", expect.objectContaining({ image_url: photo }));
  });

  it("refuses a header without pixels before the paid call, in both languages", async () => {
    const response = await send(dataUrl(png({ width: 800, height: 600 })));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ code: "image_input_invalid", issues: [{ code: "corrupt" }] });
    expect(body.errorTr).toContain("çözülemedi");
    expect(body.error).toMatch(/^This photo cannot be used/);
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("refuses a body larger than the tool's upload limit by its encoded length, without decoding it", async () => {
    const tooBig = `data:image/jpeg;base64,${"A".repeat(Math.ceil((DEMO_UPLOAD_MAX_BYTES + 1000) / 3) * 4)}`;

    const response = await send(tooBig);

    expect(response.status).toBe(422);
    expect((await response.json()).issues[0].code).toBe("too_large");
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("keeps the upload limit inside a Vercel function body once base64 and JSON are added", () => {
    // Vercel documents 4.5 MB for a function request body (413 FUNCTION_PAYLOAD_TOO_LARGE); read strictly as 4,500,000 bytes.
    const VERCEL_BODY_LIMIT = 4_500_000;
    const encoded = Math.ceil(DEMO_UPLOAD_MAX_BYTES / 3) * 4;
    const envelope = JSON.stringify({ imageDataUrl: "data:image/jpeg;base64," }).length;
    expect(encoded + envelope).toBeLessThan(VERCEL_BODY_LIMIT);
    // The old 5 MiB check let files through that this transport could never carry.
    expect(Math.ceil((5 * 1024 * 1024) / 3) * 4).toBeGreaterThan(VERCEL_BODY_LIMIT);
  });
});
