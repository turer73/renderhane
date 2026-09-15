import { getAIProvider } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/admin-check";
import {
  reserveCredits,
  confirmSpend,
  refundCredits,
} from "@/lib/credits/engine";
import { uploadToR2 } from "@/lib/r2/upload";
import { MODELS, TOOL_MODELS } from "@/lib/fal/models";
import {
  buildMinimaxInput,
  buildSinglePassText,
  buildXaiInput,
  fitSpeed,
  isAllowedXaiVoice,
  DEFAULT_XAI_VOICE,
  SRT_TTS_CONCURRENCY,
  type SrtEngine,
  type SrtMode,
} from "./voices";
import { buildSchedule } from "./schedule";

/** SRT varsayılan TTS modeli (TOOL_MODELS ilk sırası). */
const SRT_TTS_MODEL_KEY = TOOL_MODELS["srt-voiceover"][0];

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
  /** Bu replikte kullanılan hız (otomatik sığdırma yükseltmiş olabilir). */
  speed: number;
}

export interface OrchestrateResult {
  jobId: string;
  creditCost: number;
  tracks: SrtTrack[];
  totalMs: number;
  overflowCount: number;
  /** Otomatik sığdırma ile yeniden seslendirilen replik sayısı. */
  refitCount: number;
  mode: SrtMode;
  /** Tek-parça çıktının dosya URL'si (cues modunda ilk repliğinki). */
  audioUrl: string;
  /** Tek-parça ses süresi (fal duration_ms; cues modunda toplam plan). */
  audioDurationMs: number;
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
    ...MODELS[SRT_TTS_MODEL_KEY].defaultParams,
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

async function synthesizeCueXai(
  text: string,
  voiceId: string
): Promise<{ falUrl: string; durationMs: number }> {
  const result = await getAIProvider().subscribe("xai/tts/v1", {
    ...MODELS["xai-tts"].defaultParams,
    ...buildXaiInput(text, { voiceId }),
  });
  const output = result.data as MinimaxOutput;
  const falUrl = output.audio?.url;
  if (!falUrl) throw new Error("TTS produced no audio");
  // xAI duration_ms dönmez → sığdırma yok, mix istemcide gerçek boyla kurulur.
  return { falUrl, durationMs: 0 };
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
  autoFit?: boolean;
  engine?: SrtEngine;
  xaiVoiceId?: string;
  mode?: SrtMode;
}): Promise<OrchestrateResult> {
  const { userId, cues, voiceId, emotion, speed } = input;
  const autoFit = input.autoFit !== false;
  const mode: SrtMode = input.mode === "cues" ? "cues" : "single";
  const engine: SrtEngine = input.engine === "xai" ? "xai" : "minimax";
  const xaiVoice =
    input.xaiVoiceId && isAllowedXaiVoice(input.xaiVoiceId)
      ? input.xaiVoiceId
      : DEFAULT_XAI_VOICE;
  let { creditCost } = input;
  const supabase = createAdminClient();
  const model = MODELS[SRT_TTS_MODEL_KEY];

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
        autoFit,
        mode,
        engine,
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

    // TEK-PARÇA: replikler duraklama işaretleriyle tek metinde birleşir,
    // tek TTS çağrısı → tek dosya (daha ucuz, ses tutarlılığı tam).
    // Zamanlama yaklaşıktır (konuşma hızı replikten repliğe oynar).
    if (mode === "single") {
      const fullText = buildSinglePassText(cues, engine);
      let falUrl: string;
      let audioDurationMs: number;
      try {
        const out =
          engine === "xai"
            ? await synthesizeCueXai(fullText, xaiVoice)
            : await synthesizeCue(
                fullText,
                { voiceId, emotion, speed },
                model.id
              );
        falUrl = out.falUrl;
        audioDurationMs = out.durationMs;
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "TTS request failed";
        throw new Error(`Single take: ${reason}`);
      }

      let fileUrl = falUrl;
      let fileSize = 0;
      try {
        const uploaded = await uploadToR2(falUrl, userId, "audio");
        fileUrl = uploaded.r2Url;
        fileSize = uploaded.fileSize;
      } catch {
        /* fal_url still works */
      }

      const srtTotalMs = cues.length > 0 ? cues[cues.length - 1].endMs : 0;
      const singleTracks: SrtTrack[] = cues.map((cue) => ({
        index: cue.index,
        startMs: cue.startMs,
        endMs: cue.endMs,
        text: cue.text,
        url: fileUrl,
        durationMs: 0,
        overflow: false,
        speed,
      }));

      const { error: outputError } = await supabase.from("outputs").insert({
        job_id: job.id,
        user_id: userId,
        type: "audio",
        fal_url: falUrl,
        r2_url: fileUrl,
        file_size: fileSize,
        metadata: {
          tool: "srt-voiceover",
          mode: "single",
          engine,
          voiceId,
          emotion,
          speed,
          tracks: singleTracks,
          totalMs: srtTotalMs,
          audioDurationMs,
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
        tracks: singleTracks,
        totalMs: srtTotalMs,
        overflowCount: 0,
        refitCount: 0,
        mode: "single",
        audioUrl: fileUrl,
        audioDurationMs,
      };
    }

    // 1) Per-cue TTS (bounded parallelism). Reservation exists before paid calls.
    const synth = await mapPool(cues, SRT_TTS_CONCURRENCY, async (cue) => {
      try {
        if (engine === "xai") {
          const out = await synthesizeCueXai(cue.text, xaiVoice);
          return { ...out, speed: 1 };
        }
        const out = await synthesizeCue(
          cue.text,
          { voiceId, emotion, speed },
          model.id
        );
        return { ...out, speed };
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "TTS request failed";
        throw new Error(`Cue ${cue.index}: ${reason}`);
      }
    });

    // 1b) Auto-fit: taşan repliği slota sığacak hıza oturtup yeniden
    // seslendir (en fazla 1.3x — üstü doğallığı bozar, taşma kalır).
    // İkinci geçişin fal maliyeti marj içindedir, krediye yansıtılmaz.
    // xAI süre dönmediği için sığdırma yalnızca MiniMax'te.
    let refitCount = 0;
    if (autoFit && engine === "minimax") {
      const refits: { i: number; speed: number }[] = [];
      cues.forEach((cue, i) => {
        const fitted = fitSpeed(
          speed,
          synth[i].durationMs,
          cue.endMs - cue.startMs
        );
        if (fitted !== null) refits.push({ i, speed: fitted });
      });
      if (refits.length > 0) {
        const redone = await mapPool(refits, SRT_TTS_CONCURRENCY, async (r) => {
          try {
            const out = await synthesizeCue(
              cues[r.i].text,
              { voiceId, emotion, speed: r.speed },
              model.id
            );
            return { i: r.i, out, speed: r.speed };
          } catch (error) {
            const reason =
              error instanceof Error ? error.message : "TTS request failed";
            throw new Error(`Cue ${cues[r.i].index} (refit): ${reason}`);
          }
        });
        for (const r of redone) {
          synth[r.i] = { falUrl: r.out.falUrl, durationMs: r.out.durationMs, speed: r.speed };
        }
        refitCount = redone.length;
      }
    }

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
      speed: synth[i].speed,
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
        autoFit,
        engine,
        refitCount,
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
      refitCount,
      mode: "cues",
      audioUrl: persisted[0]?.url ?? "",
      audioDurationMs: schedule.totalMs,
    };
  } catch (error) {
    if (txId) await refundCredits(txId);
    const message = error instanceof Error ? error.message : "Voiceover failed";
    await markFailed(message);
    throw error instanceof Error ? error : new Error(message);
  }
}
