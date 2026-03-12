"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { extractFrames } from "@/lib/extract-frames";
import { Video, Square, RotateCcw, Check, X, Loader2 } from "lucide-react";

type RecorderState =
  | "idle"
  | "camera-active"
  | "recording"
  | "recorded"
  | "extracting"
  | "done";

interface VideoRecorderProps {
  onFramesExtracted: (frames: File[]) => void;
  onCancel: () => void;
  maxFrames?: number;
}

/** Pick the best supported MIME for MediaRecorder (mp4 for Safari, webm for others). */
function pickMime(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "";
}

const MAX_RECORD_SECONDS = 30;

export function VideoRecorder({
  onFramesExtracted,
  onCancel,
  maxFrames = 4,
}: VideoRecorderProps) {
  const tDash = useTranslations("dashboard");
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [frames, setFrames] = useState<File[]>([]);
  const [framePreviews, setFramePreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      framePreviews.forEach((u) => URL.revokeObjectURL(u));
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // Start camera
  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        await liveRef.current.play();
      }
      setState("camera-active");
    } catch {
      setError(tDash("cameraPermissionDenied"));
    }
  }, [tDash]);

  // Start recording
  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    const mime = pickMime();
    if (!mime) {
      setError(tDash("mediaRecorderNotSupported"));
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, { mimeType: mime });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      const url = URL.createObjectURL(blob);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(url);
      stopStream();
      setState("recorded");
    };

    recorder.start(100); // collect data every 100ms
    setElapsed(0);
    setState("recording");

    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev + 1 >= MAX_RECORD_SECONDS) {
          recorder.stop();
          clearTimer();
          return MAX_RECORD_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);
  }, [tDash, videoUrl]);

  // Stop recording
  const stopRecording = useCallback(() => {
    clearTimer();
    recorderRef.current?.stop();
  }, []);

  // Extract frames from recorded video
  const doExtract = useCallback(async () => {
    if (!videoUrl) return;
    setState("extracting");
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const extractedFrames = await extractFrames(blob, maxFrames);
      setFrames(extractedFrames);

      // Create preview URLs
      framePreviews.forEach((u) => URL.revokeObjectURL(u));
      const previews = extractedFrames.map((f) => URL.createObjectURL(f));
      setFramePreviews(previews);
      setState("done");
    } catch {
      setError("Frame extraction failed");
      setState("recorded");
    }
  }, [videoUrl, maxFrames, framePreviews]);

  // Re-record
  const reRecord = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    framePreviews.forEach((u) => URL.revokeObjectURL(u));
    setFramePreviews([]);
    setFrames([]);
    setElapsed(0);
    setState("idle");
  }, [videoUrl, framePreviews]);

  // Cancel everything
  const handleCancel = useCallback(() => {
    stopStream();
    clearTimer();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    framePreviews.forEach((u) => URL.revokeObjectURL(u));
    onCancel();
  }, [videoUrl, framePreviews, onCancel]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      {/* Close button */}
      <div className="absolute right-4 top-4 z-10">
        <button
          onClick={handleCancel}
          className="rounded-full bg-black/50 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
          aria-label="Close"
        >
          <X className="size-6" />
        </button>
      </div>

      {/* IDLE state — start camera */}
      {state === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="rounded-2xl bg-indigo-500/10 p-6">
            <Video className="size-12 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{tDash("recordVideo")}</h3>
            <p className="mt-2 text-sm text-white/60">{tDash("videoHint")}</p>
            <p className="mt-1 text-xs text-white/40">{tDash("maxRecordTime")}</p>
          </div>
          <Button
            onClick={startCamera}
            size="lg"
            className="h-14 px-8 bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Video className="mr-2 size-5" />
            {tDash("recordVideo")}
          </Button>
          {error && (
            <div className="mt-2 w-full max-w-sm rounded-xl bg-red-500/10 border border-red-500/20 p-4">
              <p className="text-sm font-medium text-red-400">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                className="mt-3 border-white/20 text-white hover:bg-white/10"
              >
                <X className="mr-2 size-4" />
                {tDash("goBack")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* CAMERA-ACTIVE / RECORDING — live viewfinder */}
      {(state === "camera-active" || state === "recording") && (
        <div className="flex flex-1 flex-col">
          <div className="relative flex-1">
            <video
              ref={liveRef}
              autoPlay
              playsInline
              muted
              className="size-full object-cover"
            />
            {/* Timer overlay */}
            {state === "recording" && (
              <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-red-600/90 px-4 py-1.5 backdrop-blur-sm">
                <span className="font-mono text-sm font-bold text-white">
                  {mm}:{ss}
                </span>
              </div>
            )}
          </div>

          {/* Record / Stop button */}
          <div className="flex items-center justify-center gap-4 bg-black py-8">
            {state === "camera-active" ? (
              <button
                onClick={startRecording}
                className="flex size-20 items-center justify-center rounded-full border-4 border-white transition-transform active:scale-95"
                aria-label={tDash("recordVideo")}
              >
                <div className="size-16 rounded-full bg-red-500" />
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex size-20 items-center justify-center rounded-full border-4 border-white transition-transform active:scale-95"
                aria-label={tDash("stopRecording")}
              >
                <Square className="size-8 text-white" fill="white" />
              </button>
            )}
          </div>
          {error && (
            <p className="pb-4 text-center text-sm text-red-400">{error}</p>
          )}
        </div>
      )}

      {/* RECORDED — video preview */}
      {state === "recorded" && videoUrl && (
        <div className="flex flex-1 flex-col">
          <div className="flex-1 p-4">
            <video
              ref={previewRef}
              src={videoUrl}
              controls
              playsInline
              className="size-full rounded-xl object-contain"
            />
          </div>
          <div className="flex gap-3 px-6 pb-8">
            <Button
              variant="outline"
              onClick={reRecord}
              className="flex-1 h-12 border-white/20 text-white hover:bg-white/10"
            >
              <RotateCcw className="mr-2 size-4" />
              {tDash("reRecord")}
            </Button>
            <Button
              onClick={doExtract}
              className="flex-1 h-12 bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Check className="mr-2 size-4" />
              {tDash("useThisVideo")}
            </Button>
          </div>
        </div>
      )}

      {/* EXTRACTING — loading */}
      {state === "extracting" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Loader2 className="size-10 animate-spin text-indigo-400" />
          <p className="text-sm text-white/70">{tDash("extractingFrames")}</p>
        </div>
      )}

      {/* DONE — frame preview */}
      {state === "done" && (
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <p className="mb-4 text-sm font-medium text-white/80">
            {tDash("framesExtracted")}
          </p>
          <div className="grid w-full max-w-sm grid-cols-2 gap-3">
            {framePreviews.map((src, i) => (
              <div
                key={i}
                className="relative aspect-square overflow-hidden rounded-xl border border-white/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Frame ${i + 1}`}
                  className="size-full object-cover"
                />
                <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-bold text-white backdrop-blur-sm">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex w-full max-w-sm gap-3">
            <Button
              variant="outline"
              onClick={reRecord}
              className="flex-1 h-12 border-white/20 text-white hover:bg-white/10"
            >
              <RotateCcw className="mr-2 size-4" />
              {tDash("reRecord")}
            </Button>
            <Button
              onClick={() => onFramesExtracted(frames)}
              className="flex-1 h-12 bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Check className="mr-2 size-4" />
              {tDash("useFrames")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
