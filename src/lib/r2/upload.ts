import "server-only";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

/**
 * Cloudflare R2 client — S3-compatible object storage.
 * Used to permanently store fal.ai outputs before their
 * temporary URLs expire.
 */
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!; // e.g. https://assets.renderhane.com

/**
 * Download a file from fal.ai and upload it to R2.
 * Returns the permanent public URL.
 *
 * Key format: outputs/{userId}/{uuid}.{ext}
 */
export async function uploadToR2(
  falUrl: string,
  userId: string,
  type: "glb" | "image" | "video"
): Promise<{ r2Url: string; fileSize: number }> {
  // 1. Download from fal.ai
  const response = await fetch(falUrl);
  if (!response.ok) {
    throw new Error(`Failed to download from fal.ai: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const fileSize = buffer.length;

  // 2. Determine extension and content type
  const { ext, contentType } = getFileInfo(falUrl, type);

  // 3. Upload to R2
  const key = `outputs/${userId}/${randomUUID()}.${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  const r2Url = `${PUBLIC_URL}/${key}`;

  return { r2Url, fileSize };
}

function getFileInfo(
  url: string,
  type: "glb" | "image" | "video"
): { ext: string; contentType: string } {
  // Try to extract from URL
  const urlPath = new URL(url).pathname;
  const urlExt = urlPath.split(".").pop()?.toLowerCase();

  switch (type) {
    case "glb":
      return { ext: "glb", contentType: "model/gltf-binary" };
    case "video":
      return {
        ext: urlExt === "webm" ? "webm" : "mp4",
        contentType: urlExt === "webm" ? "video/webm" : "video/mp4",
      };
    case "image":
    default:
      if (urlExt === "jpg" || urlExt === "jpeg") {
        return { ext: "jpg", contentType: "image/jpeg" };
      }
      if (urlExt === "webp") {
        return { ext: "webp", contentType: "image/webp" };
      }
      return { ext: "png", contentType: "image/png" };
  }
}
