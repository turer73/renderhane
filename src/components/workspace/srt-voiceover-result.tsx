"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { showToast } from "./workspace-toast";
import { Play, Square, Download, FileJson, TriangleAlert } from "lucide-react";

export interface SrtVoiceoverTrack {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  url: string;
  durationMs: number;
  overflow: boolean;
}

interface SrtVoiceoverResultProps {
  tracks: SrtVoiceoverTrack[];
  totalMs: number;
  overflowCount: number;
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

export function SrtVoiceoverResult({ tracks, totalMs, overflowCount, jobId }: SrtVoiceoverResultProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopRef = useRef(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [mixing, setMixing] = useState(false);

  const stopAll = () => {
    stopRef.current = true;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingIndex(null);
  };

  const playTrack = (i: number, chain: boolean) => {
    stopRef.current = false;
    const el = new Audio(tracks[i].url);
    audioRef.current = el;
    setPlayingIndex(tracks[i].index);
    el.onended = () => {
      if (stopRef.current) return;
      if (chain && i + 1 < tracks.length) playTrack(i + 1, true);
      else setPlayingIndex(null);
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

  const downloadJson = () => {
    const blob = new Blob(
      [JSON.stringify({ jobId, totalMs, overflowCount, tracks }, null, 2)],
      { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `srt-voiceover-${jobId.slice(0, 8)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  /** Tarayıcıda zaman çizelgesine sadık mix: her cue startMs ofsetinde. */
  const downloadMix = async () => {
    setMixing(true);
    try {
      const Ctx = window.OfflineAudioContext ?? window.webkitOfflineAudioContext;
      if (!Ctx) throw new Error("no-offline-audio");
      const sampleRate = 44100;
      // Decode first (1-sample scratch context): fal duration_ms can be
      // missing/0, so size the mix from real decoded lengths — never cut audio.
      const decodeCtx = new Ctx(1, 1, sampleRate);
      const decoded: { buffer: AudioBuffer; offsetMs: number }[] = [];
      for (const t of tracks) {
        const res = await fetch(t.url);
        if (!res.ok) throw new Error(`cue-${t.index}`);
        const buf = await decodeCtx.decodeAudioData(await res.arrayBuffer());
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
      const rendered = await mixCtx.startRendering();
      const blob = encodeWavMono16([rendered.getChannelData(0)], sampleRate);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `srt-voiceover-${jobId.slice(0, 8)}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      showToast("Mix indirildi", "success");
    } catch {
      showToast("Mix alınamadı (CORS) — replikleri tek tek indirin", "error");
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
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => playTrack(0, true)}>
              <Play className="h-3 w-3 mr-1" /> Tümünü çal
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={stopAll}>
              <Square className="h-3 w-3 mr-1" /> Durdur
            </Button>
          )}
        </div>
      </div>

      {overflowCount > 0 && (
        <p className="text-[10px] text-amber-600 leading-relaxed">
          İşaretli repliklerin sesi SRT slotundan uzun — ses kesilmedi, sonraki repliğe taşabilir. Hızı artırın veya metni kısaltın.
        </p>
      )}

      <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
        {tracks.map((t, i) => (
          <div
            key={t.index}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] ${
              playingIndex === t.index ? "bg-primary/10 border border-primary/30" : "bg-muted/40 border border-transparent"
            }`}
          >
            <button
              type="button"
              onClick={() => playTrack(i, false)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 hover:bg-primary/25"
              title={`${t.index}. repliği çal`}
            >
              <Play className="h-3 w-3 text-primary" />
            </button>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {formatSrtMs(t.startMs)}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground">{t.text}</span>
            {t.overflow && <TriangleAlert className="h-3 w-3 shrink-0 text-amber-500" />}
            <a
              href={t.url}
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
