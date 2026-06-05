import { fal } from "@fal-ai/client";
import { buildBackbone, type PromptContext } from "./presets";

/**
 * Smart prompt composition (server-only).
 *
 * Hybrid strategy: a deterministic English backbone (presets.ts) is blended
 * with the auto-detected product caption and the user's free-text via a small,
 * cheap LLM (fal any-llm, llama-3.2-3b). The result is one polished,
 * model-aware prompt — the SITE adapts the details instead of the user.
 *
 * It NEVER throws and ALWAYS returns a usable prompt: if the LLM is unavailable
 * or errors, the deterministic backbone (plus caption/notes) is returned, so a
 * generation is never blocked by the smart layer.
 */

/**
 * LLM that blends the prompt — via fal any-llm, billed through the existing
 * FAL_KEY (no separate provider key needed). Override per-deploy with the
 * COMPOSE_LLM_MODEL env var — switch Gemini <-> Haiku without a code change.
 *
 * For this short prompt-blend task, Gemini 2.5 Flash and Claude Haiku 4.5 are
 * the same quality tier; Flash is typically cheaper/faster, so it's the default.
 *   "google/gemini-2.5-flash"          — default: cheap, fast, strong
 *   "anthropic/claude-haiku-4.5"        — strictest output-format adherence
 *   "meta-llama/llama-3.1-8b-instruct" — cheapest open ~8B
 *   "meta-llama/llama-3.2-3b-instruct" — original (weakest)
 */
const COMPOSE_MODEL = process.env.COMPOSE_LLM_MODEL || "google/gemini-2.5-flash";

/** Models that EDIT the uploaded product image (must be told to preserve it),
 *  vs background-only product-shot models (e.g. Bria) that keep it natively. */
function isEditModel(tool: string, modelKey?: string): boolean {
  if (tool === "image-edit") return true;
  return modelKey === "nano-banana-pro-edit";
}

function buildSystemPrompt(ctx: PromptContext, isEdit: boolean): string {
  const concise = ctx.kind === "image-edit";
  return [
    "You are a professional product-photography prompt engineer for an e-commerce visual studio.",
    "Combine THREE inputs into ONE polished English prompt:",
    "1) SCENE BACKBONE — the required setting/lighting/quality. Always honor it.",
    "2) PRODUCT — what the product is; preserve its identity, never rename or restyle the product itself.",
    "3) USER NOTES — optional refinements to weave in naturally (may be empty).",
    "",
    "Rules:",
    "- Output ONLY the final prompt text. No quotes, no preamble, no markdown, no explanation.",
    concise
      ? "- Keep it CONCISE (15-40 words). Describe ONLY what should change; do not re-describe the whole image."
      : "- Keep it 30-70 words, vivid but production-ready.",
    isEdit
      ? "- This EDITS the uploaded product image: keep the product's exact shape, colors, materials and label text."
      : "- This describes the target scene/background; the product is preserved automatically.",
    "- English only. Never invent brand names, logos, or text the user did not request.",
  ].join("\n");
}

export interface ComposeArgs {
  tool: "scene" | "aplus" | "image-edit";
  modelKey?: string;
  ctx: PromptContext;
  /** User's free-text refinement (scene description, product notes, edit text) */
  userText?: string;
}

export async function composeSmartPrompt({ tool, modelKey, ctx, userText }: ComposeArgs): Promise<string> {
  const isEdit = isEditModel(tool, modelKey);
  const backbone = buildBackbone(ctx, isEdit);
  const caption = (ctx.caption ?? "").trim().slice(0, 400);
  const notes = (userText ?? "").trim().slice(0, 1000);

  // Deterministic fallback — always valid, used if the LLM is unavailable.
  const fallback = [backbone, caption ? `Product: ${caption}.` : "", notes]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!process.env.FAL_KEY) return fallback;

  const userBlock = [
    `SCENE BACKBONE: ${backbone}`,
    caption ? `PRODUCT: ${caption}` : "PRODUCT: (not specified)",
    notes ? `USER NOTES: ${notes}` : "USER NOTES: (none)",
  ].join("\n");

  try {
    fal.config({ credentials: process.env.FAL_KEY });
    const result = await fal.subscribe("fal-ai/any-llm", {
      input: {
        model: COMPOSE_MODEL,
        system_prompt: buildSystemPrompt(ctx, isEdit),
        prompt: userBlock,
      },
    });
    const output = (result?.data as { output?: string } | undefined)?.output ?? "";
    const cleaned = output.trim().replace(/^["']|["']$/g, "");
    return cleaned.length >= 8 ? cleaned : fallback;
  } catch (err) {
    console.error("[compose] LLM blend failed, using deterministic fallback:", err);
    return fallback;
  }
}
