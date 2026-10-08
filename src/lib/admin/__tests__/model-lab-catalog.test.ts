import { describe, expect, it } from "vitest";
import { MODELS, TOOL_MODELS } from "@/lib/fal/models";
import {
  buildMinimaxInput,
  buildXaiInput,
  DEFAULT_SRT_VOICE,
  DEFAULT_XAI_VOICE,
} from "@/lib/voiceover/voices";
import { buildLabInput, LAB_CATALOG } from "../model-lab-catalog";

describe("LAB_CATALOG", () => {
  it("derives a selectable row for every registered model and preserves registry data", () => {
    expect(LAB_CATALOG.map((model) => model.key).sort()).toEqual(Object.keys(MODELS).sort());
    expect(LAB_CATALOG).toHaveLength(Object.keys(MODELS).length);

    for (const row of LAB_CATALOG) {
      const source = MODELS[row.key];
      const expectedDefaults = structuredClone(source.defaultParams);
      if (["minimax-speech-02-hd", "minimax-speech-28-hd", "minimax-28-turbo"].includes(row.key)) {
        const textKey = row.key === "minimax-speech-02-hd" ? "text" : "prompt";
        expectedDefaults.voice_setting = buildMinimaxInput(
          "",
          { voiceId: DEFAULT_SRT_VOICE },
          textKey
        ).voice_setting;
      }
      if (row.key === "xai-tts") {
        expectedDefaults.voice = buildXaiInput("", { voiceId: DEFAULT_XAI_VOICE }).voice;
      }
      expect(row.endpoint).toBe(source.id);
      expect(row.name).toBe(source.displayName.en);
      expect(row.defaults).toEqual(expectedDefaults);
      expect(row.creditCost).toBe(source.creditCost);
      expect(row.docsUrl).toBe(`https://fal.ai/models/${source.id}/api`);
      expect(["3d", "image", "video", "audio", "avatar", "tools"]).toContain(row.category);
      expect(["active", "lab", "legacy"]).toContain(row.status);
      expect(row.status).toBe(
        source.adminOnly
          ? "lab"
          : Object.values(TOOL_MODELS).some((keys) => keys.includes(row.key))
            ? "active"
            : "legacy"
      );
    }
  });

  it("builds Meshy 7.1 input without losing model defaults", () => {
    const model = LAB_CATALOG.find((entry) => entry.key === "meshy-v71");
    expect(model).toBeDefined();
    expect(buildLabInput("meshy-v71", { image_url: "https://cdn.example.com/item.png" })).toEqual({
      ...MODELS["meshy-v71"].defaultParams,
      image_url: "https://cdn.example.com/item.png",
    });
  });

  it("exposes required person and garment images for FASHN", () => {
    const model = LAB_CATALOG.find((entry) => entry.key === "fashn-tryon")!;
    expect(model.fields.filter((field) => field.kind === "url")).toMatchObject([
      { key: "model_image", required: true },
      { key: "garment_image", required: true },
    ]);
    expect(buildLabInput("fashn-tryon", {
      model_image: "https://cdn.example.com/person.png",
      garment_image: "https://cdn.example.com/garment.png",
    })).toMatchObject({
      model_image: "https://cdn.example.com/person.png",
      garment_image: "https://cdn.example.com/garment.png",
      mode: "quality",
    });
    expect(() => buildLabInput("fashn-tryon", { model_image: "https://cdn.example.com/person.png" }))
      .toThrow("garment_image alanı gerekli");
  });

  it("includes both required F5-TTS inputs and optional reference transcript", () => {
    const model = LAB_CATALOG.find((entry) => entry.key === "f5-tts")!;
    expect(model.category).toBe("audio");
    expect(model.status).toBe("legacy");
    expect(model.fields).toContainEqual({ key: "gen_text", label: "Üretilecek metin", kind: "text", required: true, media: null });
    expect(model.fields).toContainEqual({ key: "ref_audio_url", label: "Referans ses adresi", kind: "url", required: true, media: "audio" });
    expect(model.fields).toContainEqual({ key: "ref_text", label: "Referans ses metni", kind: "text", required: false, media: null });
    expect(buildLabInput("f5-tts", {
      gen_text: "Merhaba dünya",
      ref_audio_url: "https://cdn.example.com/reference.wav",
    })).toEqual({ model_type: "F5-TTS", gen_text: "Merhaba dünya", ref_audio_url: "https://cdn.example.com/reference.wav" });
  });

  it("labels provider inputs in Turkish, including named multiview references", () => {
    expect(LAB_CATALOG.find((entry) => entry.key === "tripo-v25-mv")?.fields.map((field) => field.label)).toEqual([
      "Ön görünüş görsel adresi",
      "Sol görünüş görsel adresi",
      "Arka görünüş görsel adresi",
      "Sağ görünüş görsel adresi",
    ]);
    expect(LAB_CATALOG.find((entry) => entry.key === "flux-fill")?.fields.map((field) => field.label)).toEqual([
      "Kaynak görsel adresi", "İstek metni", "Maske adresi",
    ]);
    expect(LAB_CATALOG.find((entry) => entry.key === "f5-tts")?.fields.map((field) => field.label)).toEqual([
      "Üretilecek metin", "Referans ses adresi", "Referans ses metni",
    ]);
  });

  it("models confirmed minimum schemas for QR, object removal, and Tripo P1", () => {
    expect(buildLabInput("qr-code-ai", {
      image_url: "https://cdn.example.com/control.png",
      prompt: "watercolor landscape",
    })).toMatchObject({ image_url: "https://cdn.example.com/control.png", prompt: "watercolor landscape" });
    expect(() => buildLabInput("qr-code-ai", { prompt: "watercolor landscape" })).toThrow("image_url alanı gerekli");
    expect(() => buildLabInput("qr-code-ai", { image_url: "https://cdn.example.com/control.png" })).toThrow("prompt alanı gerekli");

    expect(buildLabInput("object-removal", {
      image_url: "https://cdn.example.com/photo.png",
      prompt: "Remove the sign",
    })).toMatchObject({ image_url: "https://cdn.example.com/photo.png", prompt: "Remove the sign" });
    expect(() => buildLabInput("object-removal", { image_url: "https://cdn.example.com/photo.png" })).toThrow("prompt alanı gerekli");

    expect(buildLabInput("tripo-p1", { image_url: "https://cdn.example.com/object.png" }))
      .toEqual({ image_url: "https://cdn.example.com/object.png" });
  });

  it("adds the canonical required MiniMax voice_setting for every registered MiniMax speech model", () => {
    const cases = [
      { key: "minimax-speech-02-hd", textKey: "text" },
      { key: "minimax-speech-28-hd", textKey: "prompt" },
      { key: "minimax-28-turbo", textKey: "prompt" },
    ] as const;

    for (const { key, textKey } of cases) {
      const text = "Merhaba dünya";
      const registryDefaults = structuredClone(MODELS[key].defaultParams);
      const input = buildLabInput(key, { [textKey]: text });
      const canonical = buildMinimaxInput(text, { voiceId: DEFAULT_SRT_VOICE }, textKey);
      const catalogDefaults = LAB_CATALOG.find((model) => model.key === key)!.defaults;
      expect(catalogDefaults.voice_setting).toEqual(canonical.voice_setting);
      expect(input).toMatchObject(canonical);
      expect(input).toMatchObject({
        [textKey]: text,
        voice_setting: {
          voice_id: DEFAULT_SRT_VOICE,
          speed: 1,
          emotion: "neutral",
        },
      });
      expect(input).toMatchObject(catalogDefaults);
      expect(MODELS[key].defaultParams).toEqual(registryDefaults);
    }
  });

  it("shows and submits the canonical xAI voice without mutating registry defaults", () => {
    const registryDefaults = structuredClone(MODELS["xai-tts"].defaultParams);
    const catalogDefaults = LAB_CATALOG.find((model) => model.key === "xai-tts")!.defaults;
    const input = buildLabInput("xai-tts", { text: "Merhaba dünya" });
    const canonical = buildXaiInput("Merhaba dünya", { voiceId: DEFAULT_XAI_VOICE });

    expect(catalogDefaults).toMatchObject({ voice: canonical.voice, language: "tr" });
    expect(input).toMatchObject(canonical);
    expect(input.voice).toBe(catalogDefaults.voice);
    expect(MODELS["xai-tts"].defaultParams).toEqual(registryDefaults);
  });

  it("adds required audio and mask URLs for avatar and inpainting models", () => {
    const avatar = buildLabInput("omnihuman", {
      image_url: "https://cdn.example.com/avatar.png",
      audio_url: "https://cdn.example.com/voice.wav",
    });
    expect(avatar).toMatchObject({ image_url: "https://cdn.example.com/avatar.png", audio_url: "https://cdn.example.com/voice.wav" });
    expect(() => buildLabInput("omnihuman", { image_url: "https://cdn.example.com/avatar.png" })).toThrow("audio_url alanı gerekli");

    const fill = buildLabInput("flux-fill", {
      image_url: "https://cdn.example.com/image.png",
      prompt: "replace the background",
      mask_url: "https://cdn.example.com/mask.png",
    });
    expect(fill).toMatchObject({ mask_url: "https://cdn.example.com/mask.png", prompt: "replace the background" });
    expect(() => buildLabInput("flux-fill", {
      image_url: "https://cdn.example.com/image.png",
      prompt: "replace the background",
    })).toThrow("mask_url alanı gerekli");
  });

  it("turns multi-image fields into bounded URL arrays", () => {
    expect(buildLabInput("nano-banana-pro-edit", {
      image_urls: "https://cdn.example.com/a.png\nhttps://cdn.example.com/b.png",
      prompt: "edit both references",
    })).toMatchObject({ image_urls: ["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"] });
    expect(() => buildLabInput("nano-banana-pro-edit", {
      image_urls: [1, 2] as unknown as string,
      prompt: "edit",
    })).toThrow("image_urls alanı metin olmalı");
    expect(() => buildLabInput("nano-banana-pro-edit", {
      image_urls: Array.from({ length: 5 }, (_, i) => `https://cdn.example.com/${i}.png`).join("\n"),
      prompt: "edit",
    })).toThrow("en fazla 4 adres");
  });
});

describe("buildLabInput validation", () => {
  it("rejects unknown model keys, unknown values, and missing required fields", () => {
    expect(() => buildLabInput("not-a-model", {})).toThrow("Bilinmeyen model");
    expect(() => buildLabInput("meshy-v71", { image_url: "https://cdn.example.com/a.png", target_polycount: "1" }))
      .toThrow("Bilinmeyen alan: target_polycount");
    expect(() => buildLabInput("meshy-v71", {})).toThrow("image_url alanı gerekli");
  });

  it("requires own string-keyed fields and rejects inherited, symbol, and non-plain records", () => {
    const inherited = Object.create({ image_url: "https://cdn.example.com/inherited.png" }) as Record<string, string>;
    expect(() => buildLabInput("meshy-v71", inherited)).toThrow("Girdiler alan adı ve metin değerlerinden oluşan bir nesne olmalı");

    const withSymbol = { image_url: "https://cdn.example.com/image.png" } as Record<string, string>;
    Object.defineProperty(withSymbol, Symbol("hidden"), { value: "not-json" });
    expect(() => buildLabInput("meshy-v71", withSymbol)).toThrow("Alan adları metin olmalı");

    expect(() => buildLabInput("meshy-v71", Object.create(null) as Record<string, string>))
      .toThrow("Girdiler alan adı ve metin değerlerinden oluşan bir nesne olmalı");
    expect(() => buildLabInput("meshy-v71", { image_url: "https://cdn.example.com/image.png" }))
      .not.toThrow();
  });

  it("rejects oversized text and URL values", () => {
    expect(() => buildLabInput("flux-pro", { prompt: "x".repeat(5_001) })).toThrow("prompt alanı çok uzun");
    expect(() => buildLabInput("meshy-v71", { image_url: `https://cdn.example.com/${"x".repeat(4_100)}` }))
      .toThrow("image_url alanı çok uzun");
    expect(() => buildLabInput("nano-banana-pro-edit", {
      image_urls: "x".repeat(16_400), prompt: "edit",
    })).toThrow("image_urls alanı çok uzun");
  });

  it.each([
    "http://cdn.example.com/image.png",
    "https://user:pass@cdn.example.com/image.png",
    "https://localhost/image.png",
    "https://render.local/image.png",
    "https://service.internal/image.png",
    "https://127.0.0.1/image.png",
    "https://10.0.0.4/image.png",
    "https://[::1]/image.png",
    "data:image/png;base64,AAAA",
    "file:///etc/passwd",
  ])("rejects non-public or non-HTTPS URL %s", (image_url) => {
    expect(() => buildLabInput("meshy-v71", { image_url })).toThrow("image_url alanı herkese açık bir HTTPS adresi olmalı");
  });

  it("does not mutate the catalog's nested defaults", () => {
    const before = structuredClone(MODELS["fashn-tryon"].defaultParams);
    buildLabInput("fashn-tryon", {
      model_image: "https://cdn.example.com/person.png",
      garment_image: "https://cdn.example.com/garment.png",
    });
    expect(MODELS["fashn-tryon"].defaultParams).toEqual(before);
  });
});
