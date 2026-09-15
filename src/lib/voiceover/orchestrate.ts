import { getAIProvider } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/admin-check";
import {
  reserveCredits,
  confirmSpend,
  refundCredits,
} from "@/lib/credits/engine";
import { uploadToR2 } from "@/lib/r2/upload";
import { MODELS } from "@/lib/fal/models";
import { buildMinimaxInput, SRT_TTS_CONCURRENCY } from "./voices";
import { buildSchedule } from "./schedule";

export interface SrtCueInput {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface SrtTrack {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  url: string;
  durationMs: number;
  overflow: boolean;
}

export interface OrchestrateResult {
  jobId: string;
  creditCost: number;
  tracks: SrtTrack[];
  totalMs: number;
  overflowCount: number;
}

interface MinimaxOutput {
  audio?: { url?: string };
  duration_ms?: number;
}

async function synthesizeCue(
  text: string,
  voice: { voiceId: string; emotion: string; speed: number },
  modelId: string
): Promise<{ falUrl: string; durationMs: number }> {
  const result = await getAIProvider().subscribe(modelId, {
    ...MODELS["minimax-speech-02-hd"].defaultParams,
    ...buildMinimaxInput(text, voice),
  });
  const output = result.data as MinimaxOutput;
  const falUrl = output.audio?.url;
  if (!falUrl) throw new Error("TTS produced no audio");
  return {
    falUrl,
    durationMs:
      typeof output.duration_ms === "number" && output.duration_ms > 0
        ? Math.round(output.duration_ms)
        : 0,
  };
}

/** Bounded parallel map — preserves order, fails fast on first error. */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

export async function orchestrateSrtVoiceover(input: {
  userId: string;
  userEmail?: string;
  cues: SrtCueInput[];
  voiceId: string;
  emotion: string;
  speed: number;
  creditCost: number;
}): Promise<OrchestrateResult> {
  const { userId, cues, voiceId, emotion, speed } = input;
  let { creditCost } = input;
  const supabase = createAdminClient();
  const model = MODELS["minimax-speech-02-hd"];

  try {
    const email =
      input.userEmail ??
      (await supabase.auth.admin.getUserById(userId)).data?.user?.email;
    if (isAdmin(email)) creditCost = 0;
  } catch {
    /* email çözülemezse normal kredi akışı sürer */
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      user_id: userId,
      tool: "srt-voiceover",
      model_id: model.id,
      status: "processing",
      input_params: {
        cues: cues.map((c) => ({
          index: c.index,
          startMs: c.startMs,
          endMs: c.endMs,
          text: c.text,
        })),
        voiceId,
        emotion,
        speed,
      },
      original_request: { tool: "srt-voiceover", voiceId, emotion, speed },
      credit_cost: creditCost,
      credit_tx_id: null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (jobError || !job) {
    throw new Error(`Failed to create job: ${jobError?.message || "unknown"}`);
  }

  const markFailed = async (message: string) => {
    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  };

  let txId: string | null = null;
  try {
    if (creditCost > 0) {
      txId = await reserveCredits(
        userId,
        creditCost,
        `srt-voiceover — ${model.displayName.en} [job:${job.id}]`
      );
      const { error: linkError } = await supabase
        .from("jobs")
        .update({ credit_tx_id: txId })
        .eq("id", job.id);
      if (linkError) {
        await refundCredits(txId);
        txId = null;
        throw new Error(`Failed to link credit reservation: ${linkError.message}`);
      }
    }

    // 1) Per-cue TTS (bounded parallelism). Reservation exists before paid calls.
    const synth = await mapPool(cues, SRT_TTS_CONCURRENCY, async (cue) => {
      try {
        return await synthesizeCue(
          cue.text,
          { voiceId, emotion, speed },
          model.id
        );
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "TTS request failed";
        throw new Error(`Cue ${cue.index}: ${reason}`);
      }
    });

    // 2) Persist each cue audio to R2 (fal URLs expire). R2 failure falls back
    //    to the fal URL — same convention as submit-sync.
    const persisted = await mapPool(synth, SRT_TTS_CONCURRENCY, async (s) => {
      try {
        const { r2Url, fileSize } = await uploadToR2(s.falUrl, userId, "audio");
        return { url: r2Url, fileSize };
      } catch {
        return { url: s.falUrl, fileSize: 0 };
      }
    });

    const schedule = buildSchedule(
      cues.map((c) => ({ startMs: c.startMs, endMs: c.endMs })),
      synth.map((s) => s.durationMs)
    );

    const tracks: SrtTrack[] = cues.map((cue, i) => ({
      index: cue.index,
      startMs: cue.startMs,
      endMs: cue.endMs,
      text: cue.text,
      url: persisted[i].url,
      durationMs: synth[i].durationMs,
      overflow: schedule.cues[i].overflow,
    }));

    const { error: outputError } = await supabase.from("outputs").insert({
      job_id: job.id,
      user_id: userId,
      type: "audio",
      fal_url: synth[0]?.falUrl ?? null,
      r2_url: persisted[0]?.url ?? null,
      file_size: persisted.reduce((sum, p) => sum + p.fileSize, 0),
      metadata: {
        tool: "srt-voiceover",
        voiceId,
        emotion,
        speed,
        tracks,
        totalMs: schedule.totalMs,
        overflowCount: schedule.overflowCount,
      },
    });
    if (outputError) throw new Error(`Failed to save outputs: ${outputError.message}`);

    await supabase
      .from("jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", job.id);

    if (txId) await confirmSpend(txId, job.id);

    return {
      jobId: job.id,
      creditCost,
      tracks,
      totalMs: schedule.totalMs,
      overflowCount: schedule.overflowCount,
    };
  } catch (error) {
    if (txId) await refundCredits(txId);
    const message = error instanceof Error ? error.message : "Voiceover failed";
    await markFailed(message);
    throw error instanceof Error ? error : new Error(message);
  }
}
