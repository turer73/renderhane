import { z } from "zod";

const TOOL_TYPES = [
  "3d-model", "bg-remove", "enhance", "scene", "video", "aplus",
  "image-edit", "inpainting", "object-removal", "text-to-image",
  "qr-code", "talking-avatar", "logo", "social-kit", "virtual-tryon",
] as const;

const MODEL_TIERS = ["fast", "standard", "premium"] as const;

const rgbColorSchema = z.object({
  rgb: z.object({
    r: z.number().int().min(0).max(255),
    g: z.number().int().min(0).max(255),
    b: z.number().int().min(0).max(255),
  }).strict(),
}).strict();

/**
 * Only logo generation currently accepts client-controlled model parameters.
 * Keep this schema strict: allowing arbitrary fal.ai fields here would let a
 * caller override fixed-cost defaults such as duration, resolution,
 * generate_audio, or num_images without paying the corresponding cost.
 */
const logoExtraParamsSchema = z.object({
  outputFormat: z.enum(["png", "svg"]).optional(),
  style: z.enum(["logo", "digital_illustration"]).optional(),
  colors: z.array(rgbColorSchema).max(3).optional(),
}).strict();

function isPrivateHost(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname === "169.254.169.254" ||
    hostname.endsWith(".internal") ||
    hostname === "[::1]"
  ) return true;
  if (hostname.startsWith("172.")) {
    const second = parseInt(hostname.split(".")[1], 10);
    return second >= 16 && second <= 31;
  }
  return false;
}

export const imageUrlSchema = z.string().refine(
  (url) => {
    try {
      const parsed = new URL(url);
      return ["http:", "https:"].includes(parsed.protocol) && !isPrivateHost(parsed.hostname);
    } catch {
      return false;
    }
  },
  { message: "imageUrl must be a valid public HTTP(S) URL" }
);

export const jobSubmitSchema = z.object({
  tool: z.enum(TOOL_TYPES),
  tier: z.enum(MODEL_TIERS).optional(),
  modelKey: z.string().optional(),
  imageUrl: imageUrlSchema.optional(),
  imageUrls: z.array(imageUrlSchema).min(1).max(4).optional(),
  projectId: z.string().uuid().optional(),
  prompt: z.string().min(1).max(5000).optional(),
  autoEnhance: z.boolean().optional(),
  skipBgRemove: z.boolean().optional(),
  extraParams: logoExtraParamsSchema.optional(),
  promptContext: z.record(z.string(), z.unknown()).optional(),
}).superRefine((data, ctx) => {
  if (data.extraParams && data.tool !== "logo") {
    ctx.addIssue({
      code: "custom",
      message: "extraParams are only supported for logo generation",
      path: ["extraParams"],
    });
  }

  const isTextOnly = ["text-to-image", "qr-code", "logo"].includes(data.tool);
  const isMultiImage = ["3d-model", "virtual-tryon"].includes(data.tool);
  const isHybrid = ["video", "3d-model"].includes(data.tool);
  const hasPromptOnly = !!data.prompt && !data.imageUrl && !data.imageUrls;

  if (isTextOnly || (isHybrid && hasPromptOnly)) {
    if (!data.prompt) {
      ctx.addIssue({ code: "custom", message: "prompt is required for this tool", path: ["prompt"] });
    }
  } else if (isMultiImage) {
    if (!data.imageUrls || data.imageUrls.length === 0) {
      ctx.addIssue({ code: "custom", message: "imageUrls array is required (1-4 images)", path: ["imageUrls"] });
    }
  } else {
    if (!data.imageUrl && !data.imageUrls) {
      ctx.addIssue({ code: "custom", message: "imageUrl is required for this tool", path: ["imageUrl"] });
    }
  }
});

export type JobSubmitInput = z.infer<typeof jobSubmitSchema>;

export function validateJobSubmit(body: unknown) {
  const result = jobSubmitSchema.safeParse(body);
  if (!result.success) {
    const error = result.error.issues[0]?.message || "Invalid request body";
    return { valid: false as const, error };
  }
  return { valid: true as const, data: result.data };
}
