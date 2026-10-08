import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { processWebhookEvent } from "@/lib/jobs/process-webhook";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

function verifyCron(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  if (!auth) return false;
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const token = auth.replace("Bearer ", "");

  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expected);
  if (tokenBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(tokenBuf, expectedBuf);
}

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const processed: string[] = [];
  const failed: string[] = [];

  const { data: messages, error } = await supabase.rpc("dequeue_webhooks", {
    p_batch_size: 10,
    p_visibility_timeout: 120,
  });

  if (error) {
    console.error("[process-webhooks] Dequeue error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!messages || messages.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  // An unacknowledged message becomes visible again and is re-run; log it so a
  // lost acknowledgement is not mistaken for a clean pass.
  let ackFailed = 0;
  const acknowledge = async (
    fn: "complete_webhook" | "fail_webhook",
    args: Record<string, unknown>
  ) => {
    const { error: ackError } = await supabase.rpc(fn, args);
    if (ackError) {
      ackFailed++;
      console.error(`[process-webhooks] ${fn} failed for message ${args.p_id}:`, ackError.message);
    }
  };

  for (const msg of messages) {
    try {
      const result = await processWebhookEvent({
        jobId: msg.job_id,
        txId: msg.tx_id,
        body: msg.payload as Record<string, unknown>,
      });

      if (result.ok) {
        await acknowledge("complete_webhook", { p_id: msg.id });
        processed.push(msg.job_id);
      } else {
        await acknowledge("fail_webhook", { p_id: msg.id, p_error: result.error });
        failed.push(msg.job_id);
      }
    } catch (err) {
      console.error(`[process-webhooks] Processing failed for message ${msg.id}:`, err);
      await acknowledge("fail_webhook", {
        p_id: msg.id,
        p_error: err instanceof Error ? err.message : String(err),
      });
      failed.push(msg.job_id);
    }
  }

  // Counters only, once per run that dequeued work; empty runs stay silent.
  const summary = {
    dequeued: messages.length,
    processed: processed.length,
    failed: failed.length,
    ackFailed,
  };
  console.log(`[process-webhooks] summary ${JSON.stringify(summary)}`);
  return NextResponse.json(summary);
}
