"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { showToast } from "./workspace-toast";
import { proxyUrl } from "@/lib/proxy-url";
import { Play, Square, Download, FileJson, TriangleAlert } from "lucide-react";

export interface SrtVoiceoverTrack {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  url: string;
  durationMs: number;
  overflow: boolean;
  /** Bu replikte kullanılan hız (yoksa 1 varsayılır — eski kayıtlar). */
  speed?: number;
}

interface SrtVoiceoverResultProps {
  tracks: SrtVoiceoverTrack[];
  totalMs: number;
  overflowCount: number;
  refitCount: number;
  jobId: string;
}

export function formatSrtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

function encodeWavMono16(buffers: Float32Array[], sampleRate: number): Blob {
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const data = new Float32Array(total);
  let offset = 0;
  for (const b of buffers) {
    data.set(b, offset);
    offset += b.length;
  }
  const ab = new ArrayBuffer(44 + total * 2);
  const v = new DataView(ab);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  v.setUint32(4, 36 + total * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, "data");
  v.setUint32(40, total * 2, true);
  for (let i = 0; i < total; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([ab], { type: "audio/wav" });
}

export function SrtVoiceoverResult({ tracks, totalMs, overflowCount, refitCount, jobId }: SrtVoiceoverResultProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timersRef = useRef<number[]>([]);
  const stopRef = useRef(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [mixing, setMixing] = useState(false);

  const stopAll = () => {
    stopRef.current = true;
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingIndex(null);
  };

  // Unmount'ta zamanlayıcı + sesi temizle
  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      audioRef.current?.pause();
    };
  }, []);

  const playSingle = (i: number) => {
    stopRef.current = false;
    const el = new Audio(tracks[i].url);
    audioRef.current = el;
    setPlayingIndex(tracks[i].index);
    el.onended = () => {
      if (stopRef.current) return;
      setPlayingIndex(null);
    };
    el.onerror = () => {
      showToast(`${tracks[i].index}. replik çalınamadı`, "error");
      setPlayingIndex(null);
    };
    void el.play().catch(() => {
      showToast("Ses çalınamadı", "error");
      setPlayingIndex(null);
    });
  };

  /** Zaman çizelgesine sadık önizleme: her replik SRT offset'inde başlar
   *  (mix ile birebir aynı dizilim; taşan replikler üst üste binebilir). */
  const playAll = () => {
    stopAll();
    if (tracks.length === 0) return;
    stopRef.current = false;
    const base = tracks[0].startMs;
    tracks.forEach((t, i) => {
      const id = window.setTimeout(() => {
        if (!stopRef.current) playSingle(i);
      }, Math.max(0, t.startMs - base));
      timersRef.current.push(id);
    });
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    // Firefox detached <a> click'ini yok sayar — DOM'a takıp kaldır.
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const downloadJson = () => {
    const blob = new Blob(
      [JSON.stringify({ jobId, totalMs, overflowCount, tracks }, null, 2)],
      { type: "application/json" }
    );
    downloadBlob(blob, `srt-voiceover-${jobId.slice(0, 8)}.json`);
  };

  /** Tarayıcıda zaman çizelgesine sadık mix: her cue startMs ofsetinde. */
  const downloadMix = async () => {
    setMixing(true);
    try {
      const Ctx = window.OfflineAudioContext ?? window.webkitOfflineAudioContext;
      if (!Ctx) throw new Error("stage:context");
      const sampleRate = 44100;
      // Decode first (1-sample scratch context): fal duration_ms can be
      // missing/0, so size the mix from real decoded lengths — never cut audio.
      const decodeCtx = new Ctx(1, 1, sampleRate);
      const decoded: { buffer: AudioBuffer; offsetMs: number }[] = [];
      for (const t of tracks) {
        // R2 CORS vermez → aynı-origin proxy üzerinden çek (fetch engellenmesin).
        let res: Response;
        try {
          res = await fetch(proxyUrl(t.url));
        } catch {
          throw new Error(`stage:fetch:${t.index}`);
        }
        if (!res.ok) throw new Error(`stage:fetch:${t.index}`);
        let buf: AudioBuffer;
        try {
          buf = await decodeCtx.decodeAudioData(await res.arrayBuffer());
        } catch {
          throw new Error(`stage:decode:${t.index}`);
        }
        decoded.push({ buffer: buf, offsetMs: t.startMs });
      }
      const neededMs = decoded.reduce(
        (max, d) => Math.max(max, d.offsetMs + (d.buffer.duration * 1000)),
        totalMs
      );
      // OfflineAudioContext needs a fixed length up front — recreate sized.
      const mixCtx = new Ctx(1, Math.max(1, Math.ceil((neededMs / 1000) * sampleRate)), sampleRate);
      for (const d of decoded) {
        const src = mixCtx.createBufferSource();
        src.buffer = d.buffer;
        src.connect(mixCtx.destination);
        src.start(d.offsetMs / 1000);
      }
      let rendered: AudioBuffer;
      try {
        rendered = await mixCtx.startRendering();
      } catch {
        throw new Error("stage:render");
      }
      const blob = encodeWavMono16([rendered.getChannelData(0)], sampleRate);
      downloadBlob(blob, `srt-voiceover-${jobId.slice(0, 8)}.wav`);
      showToast("Mix indirildi", "success");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      const cue = msg.split(":")[2];
      if (msg.startsWith("stage:fetch")) {
        showToast(`${cue}. replik indirilemedi (ağ) — tek tek indirmeyi dene`, "error");
      } else if (msg.startsWith("stage:decode")) {
        showToast(`${cue}. replik sesi çözülemedi — tek tek indirmeyi dene`, "error");
      } else if (msg === "stage:context") {
        showToast("Tarayıcın ses karıştırmayı desteklemiyor", "error");
      } else {
        showToast("Mix kurulamadı — replikleri tek tek indirin", "error");
      }
    } finally {
      setMixing(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground">
          {tracks.length} replik • {formatSrtMs(totalMs)}
        </span>
        {overflowCount > 0 && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-amber-600 border-amber-300">
            <TriangleAlert className="h-3 w-3 mr-1" />
            {overflowCount} taşma
          </Badge>
        )}
        <div className="ml-auto flex gap-1.5">
          {playingIndex === null ? (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={playAll}>
              <Play className="h-3 w-3 mr-1" /> Tümünü çal
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={stopAll}>
              <Square className="h-3 w-3 mr-1" /> Durdur
            </Button>
          )}
        </div>
      </div>

      {refitCount > 0 && overflowCount === 0 && (
        <p className="text-[10px] text-emerald-600 leading-relaxed">
          {refitCount} replik slota oturtmak için otomatik hızlandırıldı — zaman çizelgesi tutuyor.
        </p>
      )}
      {refitCount > 0 && overflowCount > 0 && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {refitCount} replik otomatik hızlandırıldı.
        </p>
      )}

      {overflowCount > 0 && (
        <p className="text-[10px] text-amber-600 leading-relaxed">
          İşaretli repliklerin sesi SRT slotundan uzun — ses kesilmedi, sonraki repliğe taşabilir. Bu SRT doğal konuşma için yoğun: metni kısaltın veya repliği bölün.
        </p>
      )}

      <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
        {tracks.map((t, i) => (
          <div
            key={t.index}
            title={`Slot ${formatSrtMs(t.startMs)} → ${formatSrtMs(t.endMs)}${t.durationMs > 0 ? ` • ses ${(t.durationMs / 1000).toFixed(1)}sn` : ""} • ${t.speed ?? 1}x hız`}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] ${
              playingIndex === t.index ? "bg-primary/10 border border-primary/30" : "bg-muted/40 border border-transparent"
            }`}
          >
            <button
              type="button"
              onClick={() => playSingle(i)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 hover:bg-primary/25"
              title={`${t.index}. repliği çal`}
            >
              <Play className="h-3 w-3 text-primary" />
            </button>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {formatSrtMs(t.startMs)}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground">{t.text}</span>
            {(t.speed ?? 1) > 1.001 && (
              <span className="shrink-0 rounded bg-emerald-500/15 px-1 font-mono text-[9px] text-emerald-600">
                {(t.speed ?? 1).toFixed(2).replace(/0$/, "")}x
              </span>
            )}
            {t.overflow && <TriangleAlert className="h-3 w-3 shrink-0 text-amber-500" />}
            <a
              href={proxyUrl(t.url)}
              download={`cue-${t.index}.mp3`}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              title="Repliği indir"
            >
              <Download className="h-3 w-3" />
            </a>
          </div>
        ))}
      </div>

      <div className="flex gap-1.5">
        <Button size="sm" className="h-7 flex-1 text-[11px]" onClick={() => void downloadMix()} disabled={mixing}>
          <Download className="h-3 w-3 mr-1" /> {mixing ? "Hazırlanıyor..." : "Miksi indir (WAV)"}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={downloadJson}>
          <FileJson className="h-3 w-3 mr-1" /> Zaman çizelgesi
        </Button>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  }
}
