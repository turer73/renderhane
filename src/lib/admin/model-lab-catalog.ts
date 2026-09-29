import { MODELS, TOOL_MODELS, TOOLS_TEXT_ONLY, type ToolType } from "@/lib/fal/models";
import { imageUrlSchema } from "@/lib/validations/job-submit";
import { buildMinimaxInput, DEFAULT_SRT_VOICE } from "@/lib/voiceover/voices";

export type LabField = {
  key: string;
  label: string;
  kind: "text" | "url" | "urls";
  required: boolean;
};

export type LabModel = {
  key: string;
  endpoint: string;
  name: string;
  category: string;
  status: "active" | "lab" | "legacy";
  fields: LabField[];
  defaults: Record<string, unknown>;
  creditCost: number;
  docsUrl: string;
};

const CATEGORY_BY_TOOL: Partial<Record<ToolType, LabModel["category"]>> = {
  "3d-model": "3d",
  "bg-remove": "image",
  enhance: "image",
  scene: "image",
  video: "video",
  aplus: "image",
  "image-edit": "image",
  inpainting: "image",
  "object-removal": "image",
  "text-to-image": "image",
  "qr-code": "tools",
  "talking-avatar": "avatar",
  logo: "tools",
  "social-kit": "tools",
  "virtual-tryon": "image",
  "srt-voiceover": "audio",
};

const MAX_TEXT_LENGTH = 5_000;
const MAX_URL_LENGTH = 4_096;
const MAX_IMAGE_URLS = 4;
const MINIMAX_SPEECH_MODELS = new Set([
  "minimax-speech-02-hd",
  "minimax-speech-28-hd",
  "minimax-28-turbo",
]);

function labelFor(key: string): string {
  const labels: Record<string, string> = {
    prompt: "İstek metni",
    text: "Seslendirilecek metin",
    gen_text: "Üretilecek metin",
    image_url: "Kaynak görsel adresi",
    image_urls: "Kaynak görsel adresleri",
    input_image_url: "Kaynak görsel adresi",
    front_image_url: "Ön görünüş görsel adresi",
    left_image_url: "Sol görünüş görsel adresi",
    back_image_url: "Arka görünüş görsel adresi",
    right_image_url: "Sağ görünüş görsel adresi",
    top_image_url: "Üst görünüş görsel adresi",
    bottom_image_url: "Alt görünüş görsel adresi",
    left_front_image_url: "Sol ön görünüş görsel adresi",
    right_front_image_url: "Sağ ön görünüş görsel adresi",
    model_image: "Kişi görseli adresi",
    garment_image: "Giysi görseli adresi",
    mask_url: "Maske adresi",
    audio_url: "Ses adresi",
    ref_audio_url: "Referans ses adresi",
    ref_text: "Referans ses metni",
    video_url: "Video adresi",
    scene_description: "Sahne açıklaması",
  };
  if (labels[key]) return labels[key];
  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function addField(fields: LabField[], field: LabField): void {
  if (!fields.some((existing) => existing.key === field.key)) fields.push(field);
}

function deriveFields(modelKey: string): LabField[] {
  const model = MODELS[modelKey];
  const fields: LabField[] = [];
  const defaults = model.defaultParams;

  if (model.namedImageParams?.length) {
    for (const [index, key] of model.namedImageParams.entries()) {
      const fashnImageRequired = modelKey === "fashn-tryon";
      addField(fields, {
        key,
        label: labelFor(key),
        kind: "url",
        required: fashnImageRequired || index === 0,
      });
    }
  } else if (model.imageParamKey !== "_unused") {
    addField(fields, {
      key: model.imageParamKey,
      label: labelFor(model.imageParamKey),
      kind: model.multiImage ? "urls" : "url",
      required: true,
    });
  }

  if (model.promptParamKey && model.promptParamKey !== "_unused") {
    const modelTools = (Object.keys(TOOL_MODELS) as ToolType[]).filter((tool) =>
      TOOL_MODELS[tool].includes(modelKey)
    );
    addField(fields, {
      key: model.promptParamKey,
      label: labelFor(model.promptParamKey),
      kind: "text",
      required:
        model.promptParamKey === "gen_text" ||
        model.promptParamKey === "text" ||
        modelTools.some((tool) => TOOLS_TEXT_ONLY.includes(tool)) ||
        !Object.hasOwn(defaults, model.promptParamKey),
    });
  }

  // These inputs are part of the provider contract but are not represented by
  // ModelConfig's single image/prompt fields.
  if (modelKey === "f5-tts") {
    addField(fields, {
      key: "ref_audio_url",
      label: labelFor("ref_audio_url"),
      kind: "url",
      required: true,
    });
    addField(fields, {
      key: "ref_text",
      label: labelFor("ref_text"),
      kind: "text",
      required: false,
    });
  }
  if (modelToolsContain(modelKey, "talking-avatar")) {
    addField(fields, {
      key: "audio_url",
      label: labelFor("audio_url"),
      kind: "url",
      required: true,
    });
  }
  if (modelKey === "flux-fill") {
    addField(fields, {
      key: "mask_url",
      label: labelFor("mask_url"),
      kind: "url",
      required: true,
    });
  }

  return fields;
}

function modelToolsContain(modelKey: string, target: ToolType): boolean {
  return TOOL_MODELS[target].includes(modelKey);
}

function deriveCategory(modelKey: string, endpoint: string): string {
  const assignedTools = (Object.keys(TOOL_MODELS) as ToolType[]).filter((tool) =>
    TOOL_MODELS[tool].includes(modelKey)
  );
  const assignedCategory = assignedTools
    .map((tool) => CATEGORY_BY_TOOL[tool])
    .find((category) => category !== undefined);
  if (assignedCategory) return assignedCategory;

  const identity = `${modelKey} ${endpoint}`.toLowerCase();
  if (/avatar|talking/.test(identity)) return "avatar";
  if (/\b(tts|speech|voice|audio)\b/.test(identity)) return "audio";
  if (/3d|trellis|rodin|hunyuan|tripo|meshy/.test(identity)) return "3d";
  if (/video|kling|wan|veo|seedance/.test(identity)) return "video";
  if (/image|photo|flux|recraft|bria|birefnet|ideogram|seedream/.test(identity)) return "image";
  return "tools";
}

const configuredKeys = new Set(Object.values(TOOL_MODELS).flat());

function deriveDefaults(modelKey: string, defaults: Record<string, unknown>): Record<string, unknown> {
  if (!MINIMAX_SPEECH_MODELS.has(modelKey)) return defaults;

  const textKey = modelKey === "minimax-speech-02-hd" ? "text" : "prompt";
  const canonical = buildMinimaxInput("", { voiceId: DEFAULT_SRT_VOICE }, textKey);
  return {
    ...structuredClone(defaults),
    voice_setting: canonical.voice_setting,
  };
}

export const LAB_CATALOG: LabModel[] = Object.entries(MODELS).map(([key, model]) => ({
  key,
  endpoint: model.id,
  name: model.displayName.en,
  category: deriveCategory(key, model.id),
  status: model.adminOnly ? "lab" : configuredKeys.has(key) ? "active" : "legacy",
  fields: deriveFields(key),
  defaults: deriveDefaults(key, model.defaultParams),
  creditCost: model.creditCost,
  docsUrl: `https://fal.ai/models/${model.id}/api`,
}));

function validatePublicHttpsUrl(value: string, fieldKey: string): string {
  if (value.length > MAX_URL_LENGTH) throw new Error(`${fieldKey} alanı çok uzun`);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${fieldKey} alanı herkese açık bir HTTPS adresi olmalı`);
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const isIpLiteral = hostname.startsWith("[") || /^\d+(?:\.\d+){3}$/.test(hostname);
  const isLocalHostname =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    !hostname.includes(".");

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    isIpLiteral ||
    isLocalHostname ||
    !imageUrlSchema.safeParse(value).success
  ) {
    throw new Error(`${fieldKey} alanı herkese açık bir HTTPS adresi olmalı`);
  }

  return value;
}

function normalizeText(value: string, field: LabField): string | undefined {
  const normalized = value.trim();
  if (!normalized) {
    if (field.required) throw new Error(`${field.key} alanı gerekli`);
    return undefined;
  }
  if (normalized.length > MAX_TEXT_LENGTH) throw new Error(`${field.key} alanı çok uzun`);
  return normalized;
}

function normalizeUrl(value: string, field: LabField): string | undefined {
  const normalized = value.trim();
  if (!normalized) {
    if (field.required) throw new Error(`${field.key} alanı gerekli`);
    return undefined;
  }
  return validatePublicHttpsUrl(normalized, field.key);
}

function normalizeUrls(value: string, field: LabField): string[] | undefined {
  if (value.length > MAX_URL_LENGTH * MAX_IMAGE_URLS + MAX_IMAGE_URLS - 1) {
    throw new Error(`${field.key} alanı çok uzun`);
  }
  const urls = value
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);
  if (!urls.length) {
    if (field.required) throw new Error(`${field.key} alanı gerekli`);
    return undefined;
  }
  if (urls.length > MAX_IMAGE_URLS) {
    throw new Error(`${field.key} en fazla ${MAX_IMAGE_URLS} adres kabul eder`);
  }
  return urls.map((url) => validatePublicHttpsUrl(url, field.key));
}

export function buildLabInput(
  modelKey: string,
  values: Record<string, string>
): Record<string, unknown> {
  const model = LAB_CATALOG.find((entry) => entry.key === modelKey);
  if (!model) throw new Error(`Bilinmeyen model: ${modelKey}`);
  if (
    !values ||
    typeof values !== "object" ||
    Array.isArray(values) ||
    Object.getPrototypeOf(values) !== Object.prototype
  ) {
    throw new Error("Girdiler alan adı ve metin değerlerinden oluşan bir nesne olmalı");
  }

  const fieldByKey = new Map(model.fields.map((field) => [field.key, field]));
  for (const ownKey of Reflect.ownKeys(values)) {
    if (typeof ownKey !== "string") throw new Error("Alan adları metin olmalı");
    const key = ownKey;
    if (!fieldByKey.has(key)) throw new Error(`Bilinmeyen alan: ${key}`);
    if (typeof values[key] !== "string") throw new Error(`${key} alanı metin olmalı`);
  }

  const input = structuredClone(model.defaults);
  for (const field of model.fields) {
    const value = Object.hasOwn(values, field.key) ? values[field.key] : "";
    if (field.kind === "text") {
      const normalized = normalizeText(value, field);
      if (normalized !== undefined) input[field.key] = normalized;
    } else if (field.kind === "url") {
      const normalized = normalizeUrl(value, field);
      if (normalized !== undefined) input[field.key] = normalized;
    } else {
      const normalized = normalizeUrls(value, field);
      if (normalized !== undefined) input[field.key] = normalized;
    }
  }

  return input;
}
