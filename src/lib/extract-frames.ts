/**
 * Video frame extraction utility.
 *
 * Client-only — uses the browser Canvas API + HTMLVideoElement.
 * Extracts evenly-spaced frames from a video blob and returns
 * them as File objects ready for upload.
 */

import { MAX_DIMENSION } from "@/lib/resize-image";

/**
 * Extract `frameCount` evenly-spaced frames from a video Blob.
 * Each frame is returned as a PNG File capped at MAX_DIMENSION.
 */
export async function extractFrames(
  videoBlob: Blob,
  frameCount: number = 4,
  maxDimension: number = MAX_DIMENSION,
): Promise<File[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  const url = URL.createObjectURL(videoBlob);

  try {
    // Load video metadata
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Video load failed"));
      video.src = url;
    });

    const { duration, videoWidth, videoHeight } = video;
    if (!duration || !videoWidth || !videoHeight) {
      throw new Error("Invalid video: missing duration or dimensions");
    }

    // Calculate scaled dimensions preserving aspect ratio
    const scale = Math.min(1, maxDimension / videoWidth, maxDimension / videoHeight);
    const w = Math.round(videoWidth * scale);
    const h = Math.round(videoHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;

    // Calculate evenly-spaced timestamps (avoid very start/end)
    const timestamps = Array.from(
      { length: frameCount },
      (_, i) => ((i + 0.5) * duration) / frameCount,
    );

    const frames: File[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      await seekTo(video, timestamps[i]);
      ctx.drawImage(video, 0, 0, w, h);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
          "image/png",
        );
      });

      frames.push(
        new File([blob], `frame-${i + 1}.png`, {
          type: "image/png",
          lastModified: Date.now(),
        }),
      );
    }

    return frames;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load(); // release resources
  }
}

/** Seek video to a specific time and wait for the frame to be ready. */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}
