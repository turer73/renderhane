import { describe, expect, it } from "vitest";
import { MODELS, TOOL_MODELS } from "@/lib/fal/models";
import { buildRegenerationInput, RegenerationInputError } from "../regenerate-input";

const image = "https://cdn.example/source.png";
const projectId = "11111111-1111-4111-8111-111111111111";
const meshJob = {
  tool: "3d-model",
  model_id: MODELS["meshy-v71"].id,
  project_id: projectId,
  original_request: { modelKey: "meshy-v71", imageUrl: image, tier: "premium", skipBgRemove: true, autoEnhance: false },
  input_params: { image_url: "https://cdn.example/processed.png" },
};

describe("regeneration preserves the actual model and user settings", () => {
  it("pins Meshy 7.1 and replays the source, not its processed image", () => {
    expect(buildRegenerationInput(meshJob)).toEqual({
      tool: "3d-model", modelKey: "meshy-v71", tier: "premium", projectId,
      imageUrl: image, skipBgRemove: true, autoEnhance: false,
    });
  });

  it("never copies caller, reservation, provider or orchestration authority", () => {
    const replay = buildRegenerationInput({ ...meshJob, original_request: {
      ...meshJob.original_request, userId: "attacker", userEmail: "admin@example.com",
      reservedCredit: { txId: "old-tx", amount: 0 }, orchestrationRequestId: "old-request",
      providerReconciliation: { stage: "main", requestId: "old-provider" },
    } });
    expect(Object.keys(replay)).not.toEqual(expect.arrayContaining(["userId"]));
    for (const key of ["userId", "userEmail", "reservedCredit", "orchestrationRequestId", "providerReconciliation"]) {
      expect(replay).not.toHaveProperty(key);
    }
  });

  it("preserves logo vector format, style and colors without changing endpoint", () => {
    const extraParams = { outputFormat: "svg", style: "logo", colors: [{ rgb: { r: 10, g: 20, b: 30 } }] };
    expect(buildRegenerationInput({
      tool: "logo", model_id: MODELS["recraft-v4-svg"].id, input_params: {},
      original_request: { modelKey: "recraft-v4-svg", prompt: "flower logo", extraParams },
    })).toMatchObject({ modelKey: "recraft-v4-svg", extraParams });
  });

  it("preserves avatar script and the selected Turkish voice", () => {
    expect(buildRegenerationInput({
      tool: "talking-avatar", model_id: MODELS.omnihuman.id, input_params: {},
      original_request: { imageUrl: image, script: "Merhaba", voiceId: "Turkish_Trustworthyman" },
    })).toMatchObject({ modelKey: "omnihuman", script: "Merhaba", voiceId: "Turkish_Trustworthyman" });
  });

  it("preserves pre-generated avatar audio rather than requesting another TTS", () => {
    const audioUrl = "https://cdn.example/voice.mp3";
    expect(buildRegenerationInput({
      tool: "talking-avatar", model_id: MODELS.omnihuman.id, input_params: {},
      original_request: { imageUrl: image, audioUrl },
    })).toMatchObject({ audioUrl });
  });

  it("preserves structured composition settings but strips unrecognized keys", () => {
    expect(buildRegenerationInput({
      tool: "scene", model_id: MODELS["bria-product-shot"].id, input_params: {},
      original_request: { imageUrl: image, prompt: "warm", promptContext: {
        kind: "scene", sceneType: "luxury", caption: "mug", userId: "attacker",
      } },
    }).promptContext).toEqual({ kind: "scene", sceneType: "luxury", caption: "mug" });
  });

  it("resolves a unique legacy endpoint without selecting today's default", () => {
    const replay = buildRegenerationInput({
      tool: "3d-model", model_id: MODELS.triposr.id, original_request: null,
      input_params: { image_url: image },
    });
    expect(replay.modelKey).toBe("triposr");
    expect(replay.imageUrl).toBe(image);
  });

  it("recovers legacy logo style and colors from the pinned provider input", () => {
    expect(buildRegenerationInput({
      tool: "logo", model_id: MODELS["recraft-v4-svg"].id, original_request: {},
      input_params: { prompt: "flower", style: "logo", colors: [{ rgb: { r: 10, g: 20, b: 30 } }], num_images: 10 },
    })).toMatchObject({ modelKey: "recraft-v4-svg", extraParams: { style: "logo", colors: [{ rgb: { r: 10, g: 20, b: 30 } }] } });
  });

  it("rejects a missing middle named view rather than shifting image positions", () => {
    const model = MODELS["tripo-v25-mv"];
    expect(model.namedImageParams?.length).toBeGreaterThan(2);
    expect(() => buildRegenerationInput({
      tool: "3d-model", model_id: model.id, original_request: null,
      input_params: { [model.namedImageParams![0]]: image, [model.namedImageParams![2]]: image },
    })).toThrow(RegenerationInputError);
  });

  it("rejects ambiguous legacy endpoints instead of picking the last alias", () => {
    MODELS["test-ambiguous-alias"] = MODELS["meshy-v71"];
    TOOL_MODELS["3d-model"].push("test-ambiguous-alias");
    try {
      expect(() => buildRegenerationInput({ ...meshJob, original_request: { imageUrl: image } })).toThrow(/ambiguous/);
    } finally {
      delete MODELS["test-ambiguous-alias"];
      TOOL_MODELS["3d-model"].splice(TOOL_MODELS["3d-model"].indexOf("test-ambiguous-alias"), 1);
    }
  });

  it.each([
    ["retired endpoint", { ...meshJob, model_id: "fal-ai/retired", original_request: { imageUrl: image } }],
    ["wrong endpoint", { ...meshJob, model_id: MODELS.triposr.id }],
    ["cross-tool key", { ...meshJob, original_request: { ...meshJob.original_request, modelKey: "wan-i2v" } }],
    ["unknown model key", { ...meshJob, original_request: { ...meshJob.original_request, modelKey: "retired-model" } }],
    ["malformed tier", { ...meshJob, original_request: { ...meshJob.original_request, tier: "free" } }],
    ["private image", { ...meshJob, original_request: { ...meshJob.original_request, imageUrl: "http://127.0.0.1/private" } }],
    ["corrupt original", { ...meshJob, original_request: ["source"] }],
    ["unknown tool", { ...meshJob, tool: "not-a-tool" }],
  ])("blocks %s before a new charge/provider submission", (_label, job) => {
    expect(() => buildRegenerationInput(job)).toThrow(RegenerationInputError);
  });

  it("does not replay unpriced video parameters", () => {
    expect(() => buildRegenerationInput({
      tool: "video", model_id: MODELS["wan-i2v"].id, input_params: {},
      original_request: { imageUrl: image, extraParams: { duration: 120 } },
    })).toThrow(RegenerationInputError);
  });

  it("does not silently replace an unavailable voice", () => {
    expect(() => buildRegenerationInput({
      tool: "talking-avatar", model_id: MODELS.omnihuman.id, input_params: {},
      original_request: { imageUrl: image, script: "Merhaba", voiceId: "retired-voice" },
    })).toThrow(RegenerationInputError);
  });
});
