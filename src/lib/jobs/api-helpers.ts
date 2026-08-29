import { createClient } from "@/lib/supabase/server";
import type { ToolType } from "@/lib/fal/models";

const TOOL_DISPLAY_NAMES: Record<ToolType, string> = {
  "3d-model": "3D Model",
  "bg-remove": "Arka Plan Kaldır",
  enhance: "Görsel İyileştir",
  scene: "Sahne Üret",
  video: "Video Oluştur",
  aplus: "A+ İçerik",
  "image-edit": "Görsel Düzenle",
  inpainting: "Inpainting",
  "object-removal": "Nesne Silme",
  "text-to-image": "AI Görsel Üret",
  "qr-code": "QR Kod",
  "talking-avatar": "Konuşan Avatar",
  logo: "Logo Üret",
  "social-kit": "Sosyal Medya Paketi",
  "virtual-tryon": "Kıyafet Giydirme",
};

const ALLOWED_IMAGE_HOSTS = ["assets.renderhane.com"];

function isFalMedia(hostname: string): boolean {
  return hostname === "fal.media" || hostname.endsWith(".fal.media");
}

export function validateImageUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url) {
    return "imageUrl must be a non-empty string";
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "Invalid imageUrl protocol";
    }

    const hostname = parsed.hostname;
    let isPrivate =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname === "169.254.169.254" ||
      hostname.endsWith(".internal") ||
      hostname === "[::1]";
    if (!isPrivate && hostname.startsWith("172.")) {
      const second = Number.parseInt(hostname.split(".")[1], 10);
      isPrivate = second >= 16 && second <= 31;
    }

    if (isPrivate) {
      return "Invalid imageUrl: private addresses not allowed";
    }

    const isSupabaseStorage = hostname.endsWith(".supabase.co");
    const isAllowedHost = ALLOWED_IMAGE_HOSTS.includes(hostname) || isFalMedia(hostname);

    if (!isAllowedHost && !isSupabaseStorage) {
      return "imageUrl must be from a supported domain";
    }
  } catch {
    return "Invalid imageUrl format";
  }

  return null;
}

export async function autoCreateProject(
  userId: string,
  tool: ToolType,
  imageUrl: string
): Promise<string | undefined> {
  try {
    const client = await createClient();
    const toolName = TOOL_DISPLAY_NAMES[tool] || tool;
    const now = new Date();
    const dateStr = now.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const projectName = `${toolName} — ${dateStr}`;

    const { data, error } = await client
      .from("projects")
      .insert({
        user_id: userId,
        name: projectName,
        source_image_url: imageUrl,
        thumbnail_url: imageUrl,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Auto-create project failed:", error);
      return undefined;
    }

    return data.id;
  } catch (error) {
    console.error("Auto-create project error:", error);
    return undefined;
  }
}
