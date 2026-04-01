import "server-only";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const KEY_PREFIX = "rh_";

/**
 * Generate a new API key for a user.
 * Returns the raw key (only shown once) and stores the hash.
 */
export async function generateApiKey(
  userId: string,
  name = "Default"
): Promise<{ key: string; keyPrefix: string; id: string }> {
  const rawKey = `${KEY_PREFIX}${crypto.randomBytes(32).toString("hex")}`;
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 11); // "rh_" + 8 chars

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: userId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create API key: ${error.message}`);

  return { key: rawKey, keyPrefix, id: data.id };
}

/**
 * Validate an API key and return the associated user ID.
 * Updates last_used_at on success.
 */
export async function validateApiKey(
  rawKey: string
): Promise<{ userId: string } | null> {
  if (!rawKey.startsWith(KEY_PREFIX)) return null;

  const keyHash = hashKey(rawKey);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;

  // Update last_used_at (fire and forget)
  supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return { userId: data.user_id };
}

/**
 * List all API keys for a user (without revealing the full key).
 */
export async function listApiKeys(userId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, key_prefix, name, created_at, last_used_at, is_active")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list API keys: ${error.message}`);
  return data;
}

/**
 * Revoke (deactivate) an API key.
 */
export async function revokeApiKey(userId: string, keyId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("api_keys")
    .update({ is_active: false })
    .eq("id", keyId)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to revoke API key: ${error.message}`);
}

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}
