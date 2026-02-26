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
 * Uses atomic RPC to mark transaction as completed and link to job.
 */
export async function confirmSpend(txId: string, jobId: string): Promise<void> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("confirm_spend", {
    p_tx_id: txId,
    p_job_id: jobId,
  });

  if (error) {
    throw new Error(`Failed to confirm spend: ${error.message}`);
  }

  if (data === false) {
    throw new CreditError(
      "Transaction already processed or not found",
      "ALREADY_PROCESSED"
    );
  }
}

/**
 * Refund credits after job fails.
 * Uses atomic RPC with row-level locking to prevent race conditions.
 */
export async function refundCredits(txId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("refund_credits", {
    p_tx_id: txId,
  });

  if (error) {
    throw new Error(`Failed to refund credits: ${error.message}`);
  }
}

/**
 * Add credits after purchase.
 * Uses atomic RPC with row-level locking to prevent race conditions.
 */
export async function addCredits(
  userId: string,
  amount: number,
  paymentId: string,
  description: string
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("add_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_payment_id: paymentId,
    p_description: description,
  });

  if (error) {
    if (error.message.includes("user_not_found")) {
      throw new CreditError("User not found", "NOT_FOUND");
    }
    throw new Error(`Failed to add credits: ${error.message}`);
  }

  return data as string;
}
