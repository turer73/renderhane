/**
 * Browser side of Model Lab image inputs. Files go to the admin's own folder
 * in the private `uploads` bucket (owner-folder RLS) and reach the model as
 * short-lived signed links; history keeps only the storage path.
 */

export const LAB_INPUT_LINK_TTL_SECONDS = 3600;
const BUCKET = "uploads";
const SIGN_PATH = /^\/storage\/v1\/object\/sign\/uploads\/(.+)$/;

/** The part of a Supabase browser client this module uses. */
export interface LabStorageClient {
  storage: {
    from(bucket: string): {
      upload(path: string, file: File, options: { contentType?: string; upsert?: boolean }): PromiseLike<{ error: unknown }>;
      createSignedUrls(paths: string[], expiresIn: number): PromiseLike<{
        data: Array<{ path: string | null; signedUrl: string | null; error: string | null }> | null;
        error: unknown;
      }>;
    };
  };
}

export function labInputPath(userId: string, fileName: string, now = Date.now(), random: string = crypto.randomUUID()): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(-80) || "image";
  return `${userId}/model-lab/inputs/${now}-${random.replace(/-/g, "").slice(0, 8)}-${safe}`;
}

/** Storage path of a signed `uploads` link on this project's Supabase host, or null. */
export function signedUploadPath(url: string, supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    const parsed = new URL(url);
    if (parsed.host !== new URL(supabaseUrl).host) return null;
    const match = parsed.pathname.match(SIGN_PATH);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/** Upload one prepared file; the signed link is what the model receives. */
export async function uploadLabInput(
  client: LabStorageClient,
  userId: string,
  file: File
): Promise<{ path: string; url: string } | null> {
  try {
    const path = labInputPath(userId, file.name);
    const bucket = client.storage.from(BUCKET);
    const { error } = await bucket.upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) return null;
    const { data, error: signError } = await bucket.createSignedUrls([path], LAB_INPUT_LINK_TTL_SECONDS);
    const url = data?.[0]?.signedUrl;
    return signError || !url ? null : { path, url };
  } catch {
    return null;
  }
}

/**
 * Fresh signed links for every own upload in the values, right before the
 * values are validated and sent: a link signed an hour ago may have expired.
 * `missing` lists fields whose file is no longer in storage.
 */
export async function resignLabUploads(
  client: LabStorageClient,
  values: Readonly<Record<string, string>>,
  supabaseUrl: string | undefined
): Promise<{ values: Record<string, string>; missing: string[] } | null> {
  const entries = Object.entries(values).map(([key, value]) => ({
    key,
    urls: value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean),
  }));
  const paths = [...new Set(entries.flatMap(({ urls }) => urls.flatMap((url) => signedUploadPath(url, supabaseUrl) ?? [])))];
  if (paths.length === 0) return { values: { ...values }, missing: [] };
  let signed: Map<string, string>;
  try {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrls(paths, LAB_INPUT_LINK_TTL_SECONDS);
    if (error || !data) return null;
    signed = new Map(data.flatMap((entry) => (entry.path && entry.signedUrl && !entry.error ? [[entry.path, entry.signedUrl] as const] : [])));
  } catch {
    return null;
  }
  const next: Record<string, string> = {};
  const missing = new Set<string>();
  for (const { key, urls } of entries) {
    if (urls.length === 0) {
      next[key] = values[key];
      continue;
    }
    next[key] = urls.map((url) => {
      const path = signedUploadPath(url, supabaseUrl);
      if (!path) return url;
      const fresh = signed.get(path);
      if (!fresh) missing.add(key);
      return fresh ?? url;
    }).join("\n");
  }
  return { values: next, missing: [...missing] };
}

/** Ask the server to delete an upload the admin dropped; it keeps files a run uses. */
export async function discardLabInput(path: string): Promise<void> {
  try {
    await fetch(`/api/admin/models/inputs?path=${encodeURIComponent(path)}`, { method: "DELETE", keepalive: true });
  } catch {
    // Best effort: unused uploads are also purged after the retention period.
  }
}
