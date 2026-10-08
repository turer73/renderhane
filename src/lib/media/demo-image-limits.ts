import type { ImageInputLimits } from "./image-formats";

/**
 * The free background-removal tool sends the photo as a base64 data URL in a
 * JSON body (POST /api/demo/bg-remove). A Vercel function accepts at most
 * 4.5 MB of request body and base64 adds a third, so the file itself must
 * stay below about 3.3 MB; 3 MB leaves room for the JSON around it. Larger
 * photos are prepared in the browser (re-encoded, scaled down if needed)
 * instead of being refused, and the route checks the same limits again.
 */
export const DEMO_UPLOAD_MAX_BYTES = 3_000_000;

/**
 * birefnet v2 documents no image limits; these are the demo's own (the
 * transport bound above and the tool's earlier 24 MP cap). The model computes
 * its mask at 1024×1024, so scaling a very large photo down lowers the
 * output resolution rather than the cut-out quality.
 */
export const DEMO_BG_REMOVE_LIMITS: ImageInputLimits = {
  modelKeys: ["birefnet"],
  inputKind: "image",
  maxBytes: DEMO_UPLOAD_MAX_BYTES,
  maxPixels: 24_000_000,
  minDimension: 64,
  maxDimension: null,
  formats: ["jpeg", "png", "webp"],
  minImages: 1,
  maxImages: 1,
  advisories: [],
  verification: { formats: false, size: false, dimensions: false, source: null },
};
