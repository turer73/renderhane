import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Complete a referral directly (no HTTP round-trip).
 * Called from the auth callback after a new user signs up with a ref code.
 */
export async function completeReferral(
  referralCode: string,
  refereeId: string
): Promise<boolean> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("complete_referral", {
    p_referral_code: referralCode,
    p_referee_id: refereeId,
  });

  if (error) {
    console.error("Complete referral failed:", error);
    return false;
  }

  return !!data;
}
