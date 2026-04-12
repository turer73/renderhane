import "server-only";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

/** Max file size: 500 MB */
const MAX_FILE_SIZE = 500 * 1024 * 1024;

/** Lazy-initialized R2 client singleton */
let _r2: S3Client | null = null;

function getR2(): S3Client {
  if (_r2) return _r2;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing R2 environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
  }
  _r2 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _r2;
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("Missing R2_BUCKET_NAME environment variable");
  return bucket;
}

function getPublicUrl(): string {
  const url = process.env.R2_PUBLIC_URL;
  if (!url) throw new Error("Missing R2_PUBLIC_URL environment variable");
  return url;
}

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
  // 1. Download from fal.ai with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout
  let response: Response;
  try {
    response = await fetch(falUrl, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Failed to download from fal.ai: ${response.status}`);
  }

  // Check content-length before downloading to prevent OOM
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader && parseInt(contentLengthHeader, 10) > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${contentLengthHeader} bytes exceeds ${MAX_FILE_SIZE} limit`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const fileSize = buffer.length;

  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${fileSize} bytes exceeds ${MAX_FILE_SIZE} limit`);
  }

  // 2. Determine extension and content type from response headers first
  const responseContentType = response.headers.get("content-type") || "";
  const { ext, contentType } = getFileInfo(falUrl, type, responseContentType);

  // 3. Upload to R2
  const r2 = getR2();
  const key = `outputs/${userId}/${randomUUID()}.${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  const r2Url = `${getPublicUrl()}/${key}`;

  return { r2Url, fileSize };
}

function getFileInfo(
  url: string,
  type: "glb" | "image" | "video",
  responseContentType: string = ""
): { ext: string; contentType: string } {
  // Try to extract from URL
  const urlPath = new URL(url).pathname;
  const urlExt = urlPath.split(".").pop()?.toLowerCase();

  // Prefer response Content-Type over URL guessing
  const rct = responseContentType.split(";")[0].trim().toLowerCase();

  switch (type) {
    case "glb":
      return { ext: "glb", contentType: "model/gltf-binary" };
    case "video":
      if (rct === "video/webm" || urlExt === "webm") {
        return { ext: "webm", contentType: "video/webm" };
      }
      return { ext: "mp4", contentType: "video/mp4" };
    case "image":
    default:
      // SVG detection — critical for logo/icon outputs (Recraft V3)
      if (rct === "image/svg+xml" || urlExt === "svg") {
        return { ext: "svg", contentType: "image/svg+xml" };
      }
      if (rct === "image/jpeg" || urlExt === "jpg" || urlExt === "jpeg") {
        return { ext: "jpg", contentType: "image/jpeg" };
      }
      if (rct === "image/webp" || urlExt === "webp") {
        return { ext: "webp", contentType: "image/webp" };
      }
      return { ext: "png", contentType: "image/png" };
  }
}
