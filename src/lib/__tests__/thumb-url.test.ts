import { describe, expect, it } from "vitest";
import { thumbUrl } from "../thumb-url";

describe("thumbUrl", () => {
  it("routes R2 outputs through the thumbnail endpoint", () => {
    const url = "https://assets.renderhane.com/outputs/u/a b.png";
    expect(thumbUrl(url, 160)).toBe(`/api/assets/thumb?url=${encodeURIComponent(url)}&w=160`);
  });

  it.each([
    "data:image/svg+xml,%3Csvg%3E",
    "blob:https://renderhane.com/123",
    "https://example.com/a.png",
    "https://v3.fal.media/files/x.jpg",
    "https://byrovuwvzvzipwntounn.supabase.co/storage/v1/object/sign/uploads/a.png?token=t",
    "http://assets.renderhane.com/a.png",
    "/relative.png",
  ])("leaves %s unchanged", (url) => {
    expect(thumbUrl(url, 80)).toBe(url);
  });
});
