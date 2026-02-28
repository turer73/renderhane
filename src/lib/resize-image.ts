/**
 * Shared image resize utility.
 *
 * Client-only — uses the browser Canvas API (zero server cost).
 * Both PhotoUpload and BatchUpload import from here
 * to avoid duplicate implementations.
 */

export const MAX_DIMENSION = 2048;

/**
 * Resize an image File if either dimension exceeds MAX_DIMENSION.
 * Returns the original file untouched when no resize is needed.
 */
export async function resizeImageIfNeeded(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;

      // No resize needed
      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
        resolve(file);
        return;
      }

      // Calculate new dimensions preserving aspect ratio
      const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      const newW = Math.round(width * scale);
      const newH = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, newW, newH);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob failed"));
            return;
          }
          // Preserve original filename
          const resized = new File([blob], file.name, {
            type: file.type || "image/png",
            lastModified: Date.now(),
          });
          resolve(resized);
        },
        file.type || "image/png",
        0.92
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };

    img.src = url;
  });
}
