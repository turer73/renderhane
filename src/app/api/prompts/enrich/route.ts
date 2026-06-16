import { getAIProvider } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const maxDuration = 30;

const TOOL_GUIDANCE: Record<string, string> = {
  scene: "Professional product photography on a clean surface or scene, soft directional lighting, e-commerce catalog quality.",
  aplus: "Premium e-commerce product photography in a lifestyle setting with elegant props, professional studio lighting, high-end catalog quality.",
  "image-edit": "Concise edit instruction. Describe ONLY what changes (e.g. 'change shirt color to navy blue, keep face and pose unchanged'). Do not re-describe the whole scene.",
  inpainting: "Concise inpaint instruction. Describe what should appear in the masked area, matching surrounding lighting and texture.",
  "object-removal": "Brief object removal note describing what to clean and the surface texture to restore.",
  "text-to-image": "High-quality photorealistic image generation prompt, ultra-detailed, 8K, professional lighting.",
  "qr-code": "Artistic background scenery for a QR code, with a clear focal area in the center suitable for scanning.",
  logo: "Vector-style logo prompt with brand mark, clear shape, scalable, suitable for print and screen.",
  video: "Smooth cinematic camera movement description with the subject; mention motion speed and tone.",
  "3d-model": "Detailed 3D model description: object shape, key surfaces and materials, approximate proportions. Avoid camera or lighting references.",
  "talking-avatar": "Natural spoken script for an avatar to read aloud. Keep the user's intent, fix obvious typos, prefer short sentences. Do not add visual details.",
  "virtual-tryon": "Concise garment description: type of clothing, color, fabric, fit. Avoid background or pose references.",
  default: "Polished generation prompt with concrete visual details.",
};

function buildSystemPrompt(tool: string): string {
  const guidance = TOOL_GUIDANCE[tool] ?? TOOL_GUIDANCE.default;
  return [
    "You are a professional creative director helping users craft strong AI image/video generation prompts.",
    "Given a casual user input (often in Turkish), produce ONE polished English prompt suitable for the target tool.",
    "",
    `Target tool: ${tool}`,
    `Tool guidance: ${guidance}`,
    "",
    "Rules:",
    "- Output ONLY the prompt text. No explanation, no quotes, no preamble, no markdown.",
    "- Keep length 25-80 words.",
    "- Translate to English while preserving the user's specific intent.",
    "- Add concrete visual qualifiers (lighting, composition, lens, style) only when natural.",
    "- Never invent brand names, copyrighted characters, or NSFW content the user did not request.",
    "- If the user input is empty, vague, or only contains stop words, return EXACTLY the literal string: SKIP",
  ].join("\n");
}

function isPromptToolValid(tool: unknown): tool is string {
  if (typeof tool !== "string") return false;
  return Object.prototype.hasOwnProperty.call(TOOL_GUIDANCE, tool) || tool === "default";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: general (60/min/user) — enrichment is cheap but must not be abused.
  const rl = await rateLimit(`prompt-enrich:${user.id}`, RATE_LIMITS.general);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Çok hızlı! Lütfen biraz bekle." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: { prompt?: unknown; tool?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!rawPrompt) {
    return NextResponse.json({ error: "prompt zorunlu" }, { status: 400 });
  }
  if (rawPrompt.length > 1000) {
    return NextResponse.json({ error: "prompt çok uzun (max 1000)" }, { status: 400 });
  }

  const tool = isPromptToolValid(body.tool) ? (body.tool as string) : "default";

  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: "Sunucu yapılandırma hatası" }, { status: 500 });
  }
  try {
    const result = await getAIProvider().subscribe("fal-ai/any-llm", {
      input: {
        model: "meta-llama/llama-3.2-3b-instruct",
        system_prompt: buildSystemPrompt(tool),
        prompt: rawPrompt,
      },
    });

    const output = (result?.data as { output?: string } | undefined)?.output ?? "";
    const cleaned = output.trim().replace(/^["']|["']$/g, "");

    if (!cleaned || cleaned.toUpperCase() === "SKIP") {
      return NextResponse.json({ error: "Promptu zenginleştirmek için daha fazla detay yaz" }, { status: 422 });
    }

    return NextResponse.json({ enrichedPrompt: cleaned });
  } catch (err) {
    console.error("[prompt-enrich] fal.ai error", err);
    return NextResponse.json({ error: "İyileştirme şu an çalışmıyor, sonra tekrar dene" }, { status: 502 });
  }
}
