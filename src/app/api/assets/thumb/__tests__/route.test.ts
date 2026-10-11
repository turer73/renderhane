import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

import { GET } from "../route";

const upstream = vi.fn();
const ASSET = "https://assets.renderhane.com/outputs/u/abc.png";

function request(url: string = ASSET, w: string = "160") {
  return new NextRequest(`https://renderhane.com/api/assets/thumb?url=${encodeURIComponent(url)}&w=${w}`);
}

async function png(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#3366cc" } }).png().toBuffer();
}

describe("asset thumbnail endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", upstream);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("downsizes an asset image to a square WebP the browser may cache", async () => {
    upstream.mockResolvedValue(new Response(new Uint8Array(await png(1600, 900)), { headers: { "Content-Type": "image/png" } }));
    const result = await GET(request());
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("image/webp");
    expect(result.headers.get("cache-control")).toBe("private, max-age=604800, immutable");
    const meta = await sharp(Buffer.from(await result.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 160, 160]);
    expect(upstream).toHaveBeenCalledWith(ASSET, { headers: { Accept: "image/*" }, redirect: "manual" });
  });

  it("requires a signed-in user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const result = await GET(request());
    expect(result.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["https://evil.example.com/a.png", "160", 403],
    ["http://assets.renderhane.com/a.png", "160", 400],
    ["https://assets.renderhane.com:8443/a.png", "160", 400],
    [ASSET, "1200", 400],
    [ASSET, "", 400],
  ])("rejects %s at width %s", async (url, w, status) => {
    const result = await GET(request(url, w));
    expect(result.status).toBe(status);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("does not follow upstream redirects", async () => {
    upstream.mockResolvedValue(new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/" } }));
    expect((await GET(request())).status).toBe(502);
  });

  it.each(["image/svg+xml", "text/html", "video/mp4"])("refuses non-raster source %s", async (contentType) => {
    const cancel = vi.fn();
    upstream.mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { "Content-Type": contentType } }));
    expect((await GET(request())).status).toBe(415);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("reports undecodable images instead of throwing", async () => {
    upstream.mockResolvedValue(new Response("not an image", { headers: { "Content-Type": "image/png" } }));
    expect((await GET(request())).status).toBe(422);
  });
});
