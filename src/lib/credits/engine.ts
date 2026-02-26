import { createClient } from "@/lib/supabase/server";

export class CreditError extends Error {
  constructor(
    message: string,
    public code: "INSUFFICIENT" | "NOT_FOUND" | "ALREADY_PROCESSED"
  ) {
    super(message);
    this.name = "CreditError";
  }
}

/**
 * Reserve credits before starting a job.
 * Uses the atomic `reserve_credits` PostgreSQL function to prevent
 * double-spending race conditions via row-level locking.
 * Returns the transaction ID for later spend/refund.
 */
export async function reserveCredits(
  userId: string,
  amount: number,
  description: string
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("reserve_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_description: description,
  });

  if (error) {
    if (error.message.includes("user_not_found")) {
      throw new CreditError("User not found", "NOT_FOUND");
    }
    if (error.message.includes("insufficient_credits")) {
      throw new CreditError("Insufficient credits", "INSUFFICIENT");
    }
    throw new Error(`Failed to reserve credits: ${error.message}`);
  }

  return data as string;
}

/**
 * Confirm the spend after job succeeds.
 */
export async function confirmSpend(txId: string, jobId: string): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from("credit_transactions")
    .update({ status: "completed", job_id: jobId })
    .eq("id", txId)
    .eq("status", "reserved");
}

/**
 * Refund credits after job fails.
 */
export async function refundCredits(txId: string): Promise<void> {
  const supabase = await createClient();

  // Get the transaction
  const { data: tx } = await supabase
    .from("credit_transactions")
    .select("user_id, amount")
    .eq("id", txId)
    .eq("status", "reserved")
    .single();

  if (!tx) return; // Already processed

  // Refund balance
  const { data: profile } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", tx.user_id)
    .single();

  if (profile) {
    await supabase
      .from("profiles")
      .update({ credit_balance: profile.credit_balance + Math.abs(tx.amount) })
      .eq("id", tx.user_id);
  }

  // Mark as refunded
  await supabase
    .from("credit_transactions")
    .update({ status: "refunded" })
    .eq("id", txId);
}

/**
 * Add credits after purchase.
 */
export async function addCredits(
  userId: string,
  amount: number,
  paymentId: string,
  description: string
): Promise<void> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", userId)
    .single();

  if (!profile) throw new CreditError("User not found", "NOT_FOUND");

  await supabase
    .from("profiles")
    .update({ credit_balance: profile.credit_balance + amount })
    .eq("id", userId);

  await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount,
    type: "purchase",
    status: "completed",
    description,
    payment_id: paymentId,
  });
}
