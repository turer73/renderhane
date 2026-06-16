import { getAIProvider } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { validateImageUrl } from "@/app/api/jobs/submit/route";

export const maxDuration = 30;

interface AnalysisResult {
  caption: string;
  tags: string[];
  suggestedTools: string[];
}

const TOOL_TAG_HEURISTICS: Array<{ tags: string[]; tool: string }> = [
  { tags: ["clothing", "shirt", "dress", "garment", "fashion", "apparel", "jacket", "pants", "skirt"], tool: "virtual-tryon" },
  { tags: ["product", "package", "bottle", "box", "object", "merchandise"], tool: "scene" },
  { tags: ["background", "messy", "cluttered", "table", "floor"], tool: "bg-remove" },
  { tags: ["blurry", "low quality", "pixelated", "noisy", "grainy"], tool: "enhance" },
  { tags: ["person", "people", "human", "face", "portrait", "model"], tool: "talking-avatar" },
];

function suggestTools(caption: string, tags: string[]): string[] {
  const haystack = (caption + " " + tags.join(" ")).toLowerCase();
  const matched = new Set<string>();
  for (const { tags: keywords, tool } of TOOL_TAG_HEURISTICS) {
    if (keywords.some((kw) => haystack.includes(kw))) {
      matched.add(tool);
    }
  }
  return Array.from(matched);
}

/** Heuristic short-tag extraction from a Florence caption. */
function extractTags(caption: string): string[] {
  const cleaned = caption
    .toLowerCase()
    .replace(/[.,!?;:()"']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const stopwords = new Set([
    "the", "a", "an", "of", "in", "on", "at", "with", "and", "or", "is", "are", "was", "were",
    "this", "that", "these", "those", "it", "its", "be", "to", "by", "for", "from", "as",
    "has", "have", "had", "shows", "shown", "image", "photo", "picture", "showing",
  ]);
  const counts = new Map<string, number>();
  for (const word of cleaned) {
    if (word.length < 3 || stopwords.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: general (60/min/user) — vision is cheap but should not be abused.
  const rl = await rateLimit(`image-analyze:${user.id}`, RATE_LIMITS.general);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Çok hızlı! Lütfen biraz bekle." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: { imageUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
  const urlError = validateImageUrl(imageUrl);
  if (urlError) {
    return NextResponse.json({ error: urlError }, { status: 400 });
  }

  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: "Sunucu yapılandırma hatası" }, { status: 500 });
  }
  try {
    const result = await getAIProvider().subscribe("fal-ai/florence-2-large/more-detailed-caption", {
      input: { image_url: imageUrl },
    });

    const data = result?.data as { results?: string; output?: string } | undefined;
    const caption = (data?.results ?? data?.output ?? "").trim();

    if (!caption) {
      return NextResponse.json({ error: "Görsel analiz edilemedi" }, { status: 502 });
    }

    const tags = extractTags(caption);
    const suggestedTools = suggestTools(caption, tags);

    const payload: AnalysisResult = { caption, tags, suggestedTools };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[image-analyze] fal.ai error", err);
    return NextResponse.json({ error: "Analiz şu an çalışmıyor" }, { status: 502 });
  }
}
