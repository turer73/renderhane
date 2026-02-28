"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { DownloadMenu } from "@/components/app/download-menu";
import { TOOL_KEYS, type ToolType } from "@/lib/fal/models";
import { proxyUrl } from "@/lib/proxy-url";

// Lazy-load 3D viewer for completed 3D model results
const ModelViewer = dynamic(
  () => import("@/components/viewer/model-viewer").then((m) => m.ModelViewer),
  { ssr: false, loading: () => <Viewer3DSkeleton /> }
);

function Viewer3DSkeleton() {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-xl bg-muted/50">
      <span className="text-sm text-muted-foreground animate-pulse">
        3D yükleniyor…
      </span>
    </div>
  );
}

/* ── Tool-specific icons as SVG ── */
const TOOL_ICONS: Record<string, string> = {
  "3d-model": "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
  "bg-remove": "M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z",
  enhance: "M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5Z",
  scene: "M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z",
  video: "M23 7l-7 5 7 5V7z M16 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z",
  aplus: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
};

/* ── Tool gradients ── */
const TOOL_GRADIENTS: Record<string, string> = {
  "3d-model": "from-violet-500 to-purple-600",
  "bg-remove": "from-rose-500 to-pink-600",
  enhance: "from-amber-500 to-orange-600",
  scene: "from-cyan-500 to-blue-600",
  video: "from-emerald-500 to-green-600",
  aplus: "from-indigo-500 to-blue-600",
};

/* ── Fun processing messages per tool ── */
const PROCESSING_MESSAGES_TR: Record<string, string[]> = {
  "3d-model": [
    "3D dünya oluşturuluyor...",
    "Pikseller boyut değiştiriyor...",
    "Derinlik hesaplanıyor...",
    "Mesh ağı örülüyor...",
    "Doku kaplanıyor...",
    "Neredeyse hazır...",
  ],
  "bg-remove": [
    "Arka plan siliniyor...",
    "Kenarlar temizleniyor...",
    "Son rötuşlar yapılıyor...",
  ],
  enhance: [
    "Pikseller büyütülüyor...",
    "Detaylar keskinleştiriliyor...",
    "Renk dengesi ayarlanıyor...",
  ],
  scene: [
    "Sahne tasarlanıyor...",
    "Işıklar ayarlanıyor...",
    "Ürün yerleştiriliyor...",
    "Son dokunuşlar...",
  ],
  video: [
    "Kareler oluşturuluyor...",
    "Kamera hareketi hesaplanıyor...",
    "Sahneler birleştiriliyor...",
    "Video işleniyor...",
    "Neredeyse hazır...",
  ],
  aplus: [
    "A+ sahne hazırlanıyor...",
    "Profesyonel ışıklandırma...",
    "Detaylar ekleniyor...",
    "Son rötuşlar...",
  ],
};

const PROCESSING_MESSAGES_EN: Record<string, string[]> = {
  "3d-model": [
    "Creating 3D world...",
    "Pixels are transforming...",
    "Calculating depth...",
    "Weaving the mesh...",
    "Applying textures...",
    "Almost ready...",
  ],
  "bg-remove": [
    "Removing background...",
    "Cleaning edges...",
    "Final touches...",
  ],
  enhance: [
    "Upscaling pixels...",
    "Sharpening details...",
    "Adjusting color balance...",
  ],
  scene: [
    "Designing scene...",
    "Setting up lights...",
    "Placing the product...",
    "Final touches...",
  ],
  video: [
    "Generating frames...",
    "Calculating camera motion...",
    "Compositing scenes...",
    "Processing video...",
    "Almost there...",
  ],
  aplus: [
    "Preparing A+ scene...",
    "Professional lighting...",
    "Adding details...",
    "Final touches...",
  ],
};

/* ── Confetti particles ── */
interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  rotation: number;
  scale: number;
  speedX: number;
  speedY: number;
  delay: number;
}

function ConfettiCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!active || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    const colors = [
      "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
      "#f59e0b", "#10b981", "#06b6d4", "#3b82f6",
    ];

    // Create particles
    particlesRef.current = Array.from({ length: 80 }, (_, i) => ({
      id: i,
      x: Math.random() * canvas.offsetWidth,
      y: -20 - Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      scale: 0.5 + Math.random() * 0.8,
      speedX: (Math.random() - 0.5) * 4,
      speedY: 2 + Math.random() * 4,
      delay: Math.random() * 500,
    }));

    let startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      let allDone = true;

      for (const p of particlesRef.current) {
        if (elapsed < p.delay) {
          allDone = false;
          continue;
        }

        const t = (elapsed - p.delay) / 1000;
        const px = p.x + p.speedX * t * 30;
        const py = p.y + p.speedY * t * 40 + 0.5 * 200 * t * t;
        const rot = p.rotation + t * 200;
        const alpha = Math.max(0, 1 - t / 3);

        if (alpha <= 0) continue;
        allDone = false;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;

        // Draw confetti shape (rectangle or circle)
        if (p.id % 3 === 0) {
          ctx.beginPath();
          ctx.arc(0, 0, 4 * p.scale, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-4 * p.scale, -2 * p.scale, 8 * p.scale, 4 * p.scale);
        }
        ctx.restore();
      }

      if (!allDone) {
        animRef.current = requestAnimationFrame(animate);
      }
    }

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-50"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

/* ── Animated processing dots ── */
function PulsingOrb({ gradient }: { gradient: string }) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer pulse rings */}
      <div
        className={`absolute h-24 w-24 animate-ping rounded-full bg-gradient-to-r ${gradient} opacity-10`}
        style={{ animationDuration: "2s" }}
      />
      <div
        className={`absolute h-20 w-20 animate-ping rounded-full bg-gradient-to-r ${gradient} opacity-15`}
        style={{ animationDuration: "1.5s", animationDelay: "0.5s" }}
      />
      {/* Core orb */}
      <div
        className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${gradient} shadow-lg shadow-indigo-500/25`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-pulse"
        >
          <path d="M12 3v3m6.36-.64l-2.12 2.12M21 12h-3m.64 6.36l-2.12-2.12M12 21v-3m-6.36.64l2.12-2.12M3 12h3m-.64-6.36l2.12 2.12" />
        </svg>
      </div>
    </div>
  );
}

/* ── Main modal state ── */
type ModalState = "idle" | "processing" | "completed" | "failed";

interface ProcessingJob {
  id: string;
  tool: ToolType;
  status: "pending" | "processing" | "completed" | "failed";
  output_url: string | null;
  output_type: "glb" | "image" | "video" | null;
  output_id: string | null;
  error_message: string | null;
}

export function ProcessingModal() {
  const tDash = useTranslations("dashboard");
  const tTools = useTranslations("tools");
  const tProc = useTranslations("processingModal");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ModalState>("idle");
  const [tool, setTool] = useState<ToolType | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);
  const messageRef = useRef<NodeJS.Timeout | null>(null);
  const outputRetries = useRef(0);

  const messages =
    tool
      ? locale === "tr"
        ? PROCESSING_MESSAGES_TR[tool] || PROCESSING_MESSAGES_TR["enhance"]
        : PROCESSING_MESSAGES_EN[tool] || PROCESSING_MESSAGES_EN["enhance"]
      : [];

  // Listen for job-submitted events from PhotoUpload
  useEffect(() => {
    function handleJobSubmitted(e: Event) {
      const detail = (e as CustomEvent).detail as {
        jobId: string;
        tool: ToolType;
      } | undefined;

      if (!detail) return;

      setJobId(detail.jobId);
      setTool(detail.tool);
      setState("processing");
      setProgress(0);
      setMessageIndex(0);
      setJob(null);
      setShowConfetti(false);
      outputRetries.current = 0;
      setOpen(true);
    }

    window.addEventListener("job-submitted", handleJobSubmitted);
    return () => window.removeEventListener("job-submitted", handleJobSubmitted);
  }, []);

  // Animate progress bar
  useEffect(() => {
    if (state !== "processing") return;

    // Simulate progress that slows down as it approaches 90%
    let current = 0;
    progressRef.current = setInterval(() => {
      current += Math.random() * 3 * (1 - current / 100);
      if (current > 90) current = 90;
      setProgress(current);
    }, 300);

    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [state]);

  // Cycle through processing messages
  useEffect(() => {
    if (state !== "processing" || messages.length === 0) return;

    messageRef.current = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 3000);

    return () => {
      if (messageRef.current) clearInterval(messageRef.current);
    };
  }, [state, messages.length]);

  // Poll for job status
  useEffect(() => {
    if (state !== "processing" || !jobId) return;

    async function poll() {
      try {
        const res = await fetch("/api/jobs/status");
        if (!res.ok) return;
        const data = await res.json();
        const found = (data.jobs ?? []).find(
          (j: ProcessingJob) => j.id === jobId
        );
        if (!found) return;

        if (found.status === "completed") {
          // Race condition guard: webhook marks job "completed" BEFORE
          // the output record is created (R2 upload takes time).
          // Keep polling until output_url is available (max ~12 retries = 30s).
          if (!found.output_url && outputRetries.current < 12) {
            outputRetries.current += 1;
            return; // stay in "processing" state, poll again
          }

          setJob(found);
          setProgress(100);
          setState("completed");
          // Trigger confetti after a tiny delay
          setTimeout(() => setShowConfetti(true), 300);
        } else if (found.status === "failed") {
          setJob(found);
          setState("failed");
        }
      } catch {
        // Silently ignore — will retry
      }
    }

    poll(); // Initial immediate check
    pollRef.current = setInterval(poll, 2500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [state, jobId]);

  // Cleanup on close
  function handleClose() {
    setOpen(false);
    // Slight delay before full reset so animation plays out
    setTimeout(() => {
      setState("idle");
      setTool(null);
      setJobId(null);
      setProgress(0);
      setMessageIndex(0);
      setJob(null);
      setShowConfetti(false);
    }, 300);
  }

  const gradient = tool ? TOOL_GRADIENTS[tool] || "from-indigo-500 to-purple-600" : "from-indigo-500 to-purple-600";
  const toolKey = tool ? TOOL_KEYS[tool] || tool : "";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className="sm:max-w-md overflow-hidden"
        showCloseButton={state !== "processing"}
      >
        <div className="relative">
          <ConfettiCanvas active={showConfetti} />

          {/* ── PROCESSING STATE ── */}
          {state === "processing" && (
            <div className="flex flex-col items-center gap-6 py-6">
              <DialogHeader className="items-center">
                <DialogTitle className="text-center">
                  {tProc("processingTitle")}
                </DialogTitle>
                <DialogDescription className="text-center">
                  {tool && tTools(toolKey)}
                </DialogDescription>
              </DialogHeader>

              <PulsingOrb gradient={gradient} />

              {/* Animated message */}
              <div className="min-h-[24px] text-center">
                <p className="text-sm font-medium text-muted-foreground animate-pulse">
                  {messages[messageIndex] || tDash("statusProcessing")}
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full space-y-2 px-4">
                <Progress
                  value={progress}
                  className="h-2 bg-muted/50"
                />
                <p className="text-center text-xs text-muted-foreground">
                  {tProc("pleaseWait")}
                </p>
              </div>

              {/* Floating particles animation (CSS only) */}
              <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className={`absolute h-2 w-2 rounded-full bg-gradient-to-r ${gradient} opacity-20`}
                    style={{
                      left: `${15 + i * 14}%`,
                      top: `${20 + (i % 3) * 25}%`,
                      animation: `float ${3 + i * 0.5}s ease-in-out infinite alternate`,
                      animationDelay: `${i * 0.4}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── COMPLETED STATE ── */}
          {state === "completed" && job && (
            <div className="flex flex-col items-center gap-4 py-4">
              <DialogHeader className="items-center">
                <DialogTitle className="flex items-center gap-2 text-center">
                  <span className="text-2xl">🎉</span>
                  {tProc("completedTitle")}
                  <span className="text-2xl">🎉</span>
                </DialogTitle>
                <DialogDescription className="text-center">
                  {tool && tTools(toolKey)} — {tDash("statusCompleted")}
                </DialogDescription>
              </DialogHeader>

              {/* Result preview */}
              {job.output_url && job.output_type === "image" && (
                <div className="relative w-full overflow-hidden rounded-xl border border-border/50 bg-muted/20">
                  <Image
                    src={job.output_url}
                    alt="Result"
                    width={400}
                    height={400}
                    unoptimized
                    className="h-auto w-full object-contain max-h-[300px]"
                  />
                  {/* Success checkmark overlay */}
                  <div className="absolute top-3 right-3">
                    <Badge
                      variant="default"
                      className="bg-emerald-500 text-white border-0 gap-1"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      {tDash("statusCompleted")}
                    </Badge>
                  </div>
                </div>
              )}

              {job.output_url && job.output_type === "glb" && (
                <div className="w-full overflow-hidden rounded-xl border border-border/50">
                  <ModelViewer
                    url={proxyUrl(job.output_url)}
                    className="h-[280px] w-full"
                    autoRotate={true}
                  />
                </div>
              )}

              {job.output_url && job.output_type === "video" && (
                <div className="w-full overflow-hidden rounded-xl border border-border/50">
                  <video
                    src={proxyUrl(job.output_url)}
                    controls
                    autoPlay
                    muted
                    loop
                    className="h-auto w-full max-h-[300px] bg-black"
                  />
                </div>
              )}

              {/* Fallback when output hasn't arrived yet */}
              {!job.output_url && (
                <div className="flex h-[120px] w-full items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/20">
                  <p className="text-sm text-muted-foreground animate-pulse">
                    {tProc("outputLoading")}
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex w-full flex-col items-center gap-3 pt-2">
                {/* Primary: Download button (prominent) */}
                {job.output_url && (
                  <div className="flex w-full items-center justify-center gap-2">
                    <DownloadMenu
                      url={proxyUrl(job.output_url)}
                      outputType={job.output_type ?? "image"}
                    />
                  </div>
                )}

                {/* Secondary row */}
                <div className="flex items-center justify-center gap-2">
                  {job.output_id && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/${locale}/app/output/${job.output_id}`}>
                        {tProc("viewDetail")}
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClose}
                  >
                    {tProc("close")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── FAILED STATE ── */}
          {state === "failed" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <DialogHeader className="items-center">
                <DialogTitle className="flex items-center gap-2 text-center text-red-500">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  {tProc("failedTitle")}
                </DialogTitle>
                <DialogDescription className="text-center">
                  {job?.error_message || tDash("jobError")}
                </DialogDescription>
              </DialogHeader>

              <Button variant="outline" onClick={handleClose}>
                {tProc("close")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
