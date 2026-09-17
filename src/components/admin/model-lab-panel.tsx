"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Loader2, Play, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

interface LabModel {
  key: string;
  tool: string;
  label: string;
  costNote: string;
  needs: ("prompt" | "image" | "audio")[];
  imageLabel?: string;
  defaultPrompt?: string;
  priceUnverified?: boolean;
}

/** Mirrors MODELS adminOnly entries — keep in sync when adding lab models. */
const LAB_MODELS: LabModel[] = [
  {
    key: "gpt-image-25-sunburst",
    tool: "text-to-image",
    label: "GPT-Image 2.5 Sunburst",
    costNote: "~$0.15",
    needs: ["prompt"],
    defaultPrompt: "a red ceramic vase on white background, studio product photo",
  },
  {
    key: "seedream-v5-pro",
    tool: "text-to-image",
    label: "Seedream 5 Pro",
    costNote: "~$0.07",
    needs: ["prompt"],
    defaultPrompt: "a red ceramic vase on white background, studio product photo",
  },
  {
    key: "minimax-h3-max",
    tool: "video",
    label: "MiniMax H3 Max (5sn 768p)",
    costNote: "~$0.40",
    needs: ["prompt", "image"],
    defaultPrompt: "slow camera orbit around the product",
  },
  {
    key: "seedance-25",
    tool: "video",
    label: "Seedance 2.5 (5sn 720p)",
    costNote: "~$2.31",
    needs: ["prompt"],
    defaultPrompt: "slow camera orbit around the product",
    priceUnverified: true,
  },
  {
    key: "tripo-h31",
    tool: "3d-model",
    label: "Tripo H3.1",
    costNote: "~$0.50?",
    needs: ["image"],
    priceUnverified: true,
  },
  {
    key: "happy-horse-v11",
    tool: "video",
    label: "Happy Horse (TR lip-sync)",
    costNote: "~$0.70",
    needs: ["prompt"],
    defaultPrompt: "Merhaba, yeni koleksiyonumuz mağazada. Kısa ve samimi bir tanıtım konuşması yap.",
  },
  {
    key: "heygen-lipsync",
    tool: "talking-avatar",
    label: "HeyGen Lip-Sync",
    costNote: "~$1.00/10sn",
    needs: ["image", "audio"],
    imageLabel: "Video URL (dublanacak görüntü)",
  },
  {
    key: "eleven-v3",
    tool: "srt-voiceover",
    label: "ElevenLabs v3 (TR teyitsiz)",
    costNote: "~$0.05",
    needs: ["prompt"],
    defaultPrompt: "Merhaba, bu bir ses testidir. Türkçe prozodi kontrol ediliyor.",
  },
  {
    key: "minimax-28-turbo",
    tool: "srt-voiceover",
    label: "MiniMax 2.8 Turbo",
    costNote: "~$0.03",
    needs: ["prompt"],
    defaultPrompt: "Merhaba, bu bir ses testidir. Türkçe prozodi kontrol ediliyor.",
  },
];

interface ProbeResult {
  modelKey: string;
  endpoint: string;
  ms: number;
  outputUrl: string;
  kind: "video" | "image" | "audio" | "glb" | "file";
}

export function ModelLabPanel() {
  const t = useTranslations("admin");
  const [selected, setSelected] = useState(LAB_MODELS[0].key);
  const [prompt, setPrompt] = useState(LAB_MODELS[0].defaultPrompt ?? "");
  const [imageUrl, setImageUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);

  const model = LAB_MODELS.find((m) => m.key === selected) ?? LAB_MODELS[0];

  function pick(key: string) {
    setSelected(key);
    setResult(null);
    const next = LAB_MODELS.find((m) => m.key === key);
    setPrompt(next?.defaultPrompt ?? "");
  }

  async function runProbe() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: model.tool,
          modelKey: model.key,
          prompt: prompt.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
          audioUrl: audioUrl.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Probe failed");
      setResult(data as ProbeResult);
      toast.success(t("labSuccess"));
    } catch (err) {
      toast.error(
        t("labError") + (err instanceof Error ? `: ${err.message}` : "")
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-50 p-2.5 dark:bg-amber-500/10">
            <FlaskConical className="size-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-lg">{t("lab")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("labDesc")}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <TriangleAlert className="size-4 shrink-0" />
          <span>{t("labSpendNote")}</span>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">{t("labModel")}</Label>
          <select
            value={selected}
            onChange={(e) => pick(e.target.value)}
            className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          >
            {LAB_MODELS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} — {m.costNote}
              </option>
            ))}
          </select>
        </div>

        {model.needs.includes("prompt") && (
          <div>
            <Label className="text-xs text-muted-foreground">
              {model.tool === "srt-voiceover" || model.tool === "talking-avatar"
                ? t("labText")
                : t("labPrompt")}
            </Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="mt-1.5 min-h-[80px] text-sm bg-background/50 resize-y"
            />
          </div>
        )}

        {model.needs.includes("image") && (
          <div>
            <Label className="text-xs text-muted-foreground">
              {model.imageLabel ?? t("labImage")}
            </Label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1.5 h-9 font-mono text-xs"
            />
          </div>
        )}

        {model.needs.includes("audio") && (
          <div>
            <Label className="text-xs text-muted-foreground">{t("labAudio")}</Label>
            <Input
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="https://...mp3"
              className="mt-1.5 h-9 font-mono text-xs"
            />
          </div>
        )}

        <Button onClick={runProbe} disabled={running} size="sm" className="gap-2">
          {running ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          {running ? t("labRunning") : `${t("labRun")} (${model.costNote})`}
        </Button>

        {result && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="font-mono">{result.ms}ms</Badge>
              <span className="font-mono truncate">{result.endpoint}</span>
            </div>
            {result.kind === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.outputUrl} alt={result.modelKey} className="max-h-64 rounded-lg object-contain" />
            )}
            {result.kind === "video" && (
              <video src={result.outputUrl} controls className="max-h-64 w-full rounded-lg" />
            )}
            {result.kind === "audio" && (
              <audio src={result.outputUrl} controls className="w-full" />
            )}
            {(result.kind === "glb" || result.kind === "file") && (
              <a
                href={result.outputUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline"
              >
                {result.outputUrl}
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
