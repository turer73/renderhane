import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

function verifySignature(jobId: string, txId: string | null, signature: string): boolean {
  const secret = process.env.FAL_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const payload = `${jobId}:${txId || ""}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);

  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const txId = searchParams.get("txId");
  const signature = searchParams.get("sig");

  if (!jobId || !signature || !verifySignature(jobId, txId, signature)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error: enqueueErr } = await supabase.rpc("enqueue_webhook", {
    p_payload: body,
    p_job_id: jobId,
    p_tx_id: txId,
    p_signature: signature,
  });

  if (enqueueErr) {
    console.error("[webhook] Enqueue failed:", enqueueErr);
    return NextResponse.json({ error: "Queue error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
