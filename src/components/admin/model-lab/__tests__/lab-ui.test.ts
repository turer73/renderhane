import { describe, expect, it, vi } from "vitest";
import { createElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import type { LabRunDto, LabRunOutputDto } from "@/lib/admin/model-lab-flow";
import { LabWorkbench, ModelLabPanel } from "../../model-lab-panel";
import { labPreviewSource } from "../lab-output";
import { LabProgress } from "../lab-progress";
import { LabResults, type LabRunActions } from "../lab-results";

const NOW = Date.parse("2026-10-02T12:00:00.000Z");
const STORED = "https://proj.supabase.co/storage/v1/object/sign/uploads/admin-a/model-lab/r1";
const noop = vi.fn();
const actions: LabRunActions = { onDelete: noop, onResolve: noop, onRetryStorage: noop, onPollNow: noop, onRefreshLinks: noop };

function render(node: ReactElement, locale: "tr" | "en" = "tr") {
  // createElement passes `node` as children; the props type insists on them too.
  const config = { locale, messages: locale === "tr" ? tr : en, timeZone: "Europe/Istanbul" } as unknown as ComponentProps<typeof NextIntlClientProvider>;
  return renderToStaticMarkup(createElement(NextIntlClientProvider, config, node));
}

function output(patch: Partial<LabRunOutputDto>): LabRunOutputDto {
  return { kind: "image", stored: true, url: `${STORED}/0.png?token=view`, downloadUrl: `${STORED}/0.png?token=dl`, bytes: 1_500_000, mime: "image/png", ...patch };
}

function run(id: string, patch: Partial<LabRunDto> = {}): LabRunDto {
  return {
    id,
    modelKey: "flux-kontext",
    modelName: `Model ${id}`,
    endpoint: "fal-ai/flux-pro/kontext",
    status: "completed",
    requestId: `request-${id}`,
    createdAt: "2026-10-02T09:30:00.000Z",
    updatedAt: "2026-10-02T09:31:00.000Z",
    completedAt: "2026-10-02T09:31:00.000Z",
    expiresAt: "2026-11-01T09:30:00.000Z",
    inputs: [],
    outputs: [],
    storage: "none",
    error: null,
    errorCode: null,
    linksExpireAt: NOW + 3_600_000,
    ...patch,
  };
}

function results(runs: LabRunDto[], extra: Partial<Parameters<typeof LabResults>[0]> = {}, locale: "tr" | "en" = "tr") {
  return render(createElement(LabResults, {
    runs, loading: false, error: "", hasMore: false, retentionDays: 30, paused: new Set<string>(), busy: new Set<string>(),
    actions, onRetry: noop, onLoadMore: noop, ...extra,
  }), locale);
}

describe("Model Lab results", () => {
  it("previews stored and provider outputs only where the CSP allows, with open and download links", () => {
    const html = results([run("r1", {
      storage: "partial",
      outputs: [
        output({}),
        output({ kind: "video", url: `${STORED}/1.mp4?token=view`, downloadUrl: `${STORED}/1.mp4?token=dl`, bytes: 5_000_000, mime: "video/mp4" }),
        output({ kind: "video", url: `${STORED}/2.mp4?token=view`, downloadUrl: `${STORED}/2.mp4?token=dl`, bytes: 120_000_000, mime: "video/mp4" }),
        output({ kind: "audio", stored: false, url: "https://v3.fal.media/files/b.wav", downloadUrl: "https://v3.fal.media/files/b.wav", bytes: null, mime: null }),
        output({ kind: "glb", url: `${STORED}/3.glb?token=view`, downloadUrl: `${STORED}/3.glb?token=dl`, mime: "model/gltf-binary" }),
        output({ kind: "glb", stored: false, url: "https://cdn.example/x.glb", downloadUrl: "https://cdn.example/x.glb", bytes: null, mime: null }),
        output({ kind: "file", stored: false, url: "javascript:alert(1)", downloadUrl: "javascript:alert(1)", bytes: null, mime: null }),
      ],
    })]);

    expect(html).toContain(`<img src="${STORED}/0.png?token=view"`);
    expect(html).toContain(`href="${STORED}/0.png?token=dl" download=""`);
    // media-src does not list storage: stored audio/video is fetched into a blob after mount.
    expect(html).not.toContain(`<video src="${STORED}`);
    expect(html).toContain("Önizlemeyi yükle (120 MB)");
    // Provider media goes through the same-origin proxy and is labelled temporary.
    expect(html).toContain(`<audio src="/api/assets/proxy?url=${encodeURIComponent("https://v3.fal.media/files/b.wav")}"`);
    expect(html).toContain("Geçici sağlayıcı bağlantısı — kalıcı değil");
    expect(html).toContain("3D önizlemeyi aç");
    expect(html).toContain("Önizleme gösterilemiyor; dosyayı açın veya indirin.");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Bazı çıktılar kalıcı depoya kopyalanamadı");
    expect(html).toContain("Kalıcı kopyayı yeniden dene");
  });

  it("shows model, date, request id and a localized status and error, never the stored server text", () => {
    const failed = run("r2", { status: "failed", errorCode: "provider_failed", error: "Sağlayıcı işi tamamlayamadı." });
    const turkish = results([failed]);
    expect(turkish).toContain("Model r2");
    expect(turkish).toContain("İstek: request-r2");
    expect(turkish).toContain(`<time dateTime="2026-10-02T09:30:00.000Z">`);
    expect(turkish).toContain("Başarısız");
    expect(turkish).toContain("Sağlayıcı bu işi tamamlayamadı.");

    const english = results([failed], {}, "en");
    expect(english).toContain("Failed");
    expect(english).toContain("The provider could not complete this job.");
    expect(english).not.toContain("Sağlayıcı işi tamamlayamadı.");
  });

  it("offers delete only for finished runs and the history check only for unknown ones", () => {
    const html = results([
      run("done"),
      run("active", { status: "queued", completedAt: null }),
      run("unclear", { status: "unknown", completedAt: null, requestId: null, errorCode: "submission_uncertain" }),
    ]);
    expect(html.match(/Denemeyi sil/g)).toHaveLength(1);
    expect(html.match(/Sağlayıcı geçmişini kontrol ettim/g)).toHaveLength(1);
    expect(html).toContain("İstek numarası henüz yok");
    expect(html).toContain("Kuyrukta");
    expect(html).toContain("Belirsiz");
  });

  it("explains copying, empty results, paused tracking, paging and retention", () => {
    const html = results([
      run("copying", { storage: "pending", outputs: [output({ stored: false, url: "https://v3.fal.media/a.png", downloadUrl: "https://v3.fal.media/a.png" })] }),
      run("empty", { storage: "none" }),
      run("waiting", { status: "running", completedAt: null }),
    ], { paused: new Set(["waiting"]), hasMore: true });
    expect(html).toContain("Çıktılar kalıcı depoya kopyalanıyor…");
    expect(html).toContain("Bu yanıt biçiminden dosya adresi çıkarılamadı.");
    expect(html).toContain("Takip geçici olarak duraklatıldı");
    expect(html).toContain("Durumu yeniden kontrol et — yeni üretim yapmaz");
    expect(html).toContain("Daha eski denemeler");
    expect(html).toContain("Denemeler 30 gün saklanır");
  });

  it("covers loading, empty and failed history reads", () => {
    expect(results([], { loading: true })).toContain("Deneme geçmişi yükleniyor…");
    expect(results([])).toContain("Henüz deneme yok.");
    const failed = results([], { error: "Deneme geçmişi okunamadı." });
    expect(failed).toContain("Deneme geçmişi okunamadı.");
    expect(failed).toContain("Yeniden dene");
  });

  it("stays usable on a phone: one output column, wrapping ids and 44 px tap targets", () => {
    const html = results([run("r1", { outputs: [output({})], requestId: "x".repeat(120) })]);
    expect(html).toContain("grid min-w-0 gap-3 sm:grid-cols-2");
    expect(html).toContain("break-all font-mono");
    expect(html).toMatch(/<article[^>]*class="min-w-0 /);
    for (const button of html.match(/<button[^>]*>/g) ?? []) expect(button).toContain("min-h-11");
    for (const link of html.match(/<a [^>]*>/g) ?? []) expect(link).toContain("min-h-11");
  });
});

describe("Model Lab output preview source", () => {
  it.each([
    [{ kind: "image", stored: true, url: `${STORED}/a.png` }, { url: `${STORED}/a.png`, viaBlob: false }],
    [{ kind: "video", stored: true, url: `${STORED}/a.mp4` }, { url: `${STORED}/a.mp4`, viaBlob: true }],
    [{ kind: "audio", stored: false, url: "https://fal.media/files/a.mp3" }, { url: `/api/assets/proxy?url=${encodeURIComponent("https://fal.media/files/a.mp3")}`, viaBlob: false }],
    [{ kind: "video", stored: false, url: "https://cdn.example/a.mp4" }, null],
    [{ kind: "image", stored: false, url: "http://cdn.example/a.png" }, null],
  ] as const)("%j → %j", (patch, expected) => {
    expect(labPreviewSource(output(patch as Partial<LabRunOutputDto>))).toEqual(expected);
  });
});

describe("Model Lab progress", () => {
  it("marks the current step and the finished ones", () => {
    const html = render(createElement(LabProgress, { phase: "running" }));
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="step"[^>]*>.*?Çalışıyor<\/li>/);
    expect(html).toContain("Model çalışıyor.");
    for (const step of ["Yükleniyor", "Doğrulanıyor", "Kuyrukta", "Çalışıyor", "Tamamlandı"]) expect(html).toContain(step);
  });

  it("ends in the unknown or failed state instead of completed", () => {
    const unknown = render(createElement(LabProgress, { phase: "unknown" }));
    expect(unknown).toMatch(/aria-current="step"[^>]*>.*?Belirsiz<\/li>/);
    expect(unknown).not.toContain("Tamamlandı");
    const failed = render(createElement(LabProgress, { phase: "failed" }), "en");
    expect(failed).toMatch(/aria-current="step"[^>]*>.*?Failed<\/li>/);
  });

  it("shows no current step before an attempt", () => {
    const html = render(createElement(LabProgress, { phase: "idle" }));
    expect(html).not.toContain("aria-current");
    expect(html).not.toContain('role="status"');
  });
});

describe("Model Lab form", () => {
  it("waits for hydration before reading browser state", () => {
    expect(render(createElement(ModelLabPanel, { userId: "admin-a" }))).toContain("Laboratuvar yükleniyor…");
  });

  it("gives an image field upload, drag and drop and an address alternative, with the model's limits", () => {
    const html = render(createElement(LabWorkbench, { userId: "admin-a", initialModelKey: "meshy-v71" }));
    expect(html).toContain("<legend");
    expect(html).toContain("Görseli sürükleyip bırakın");
    expect(html).toContain("Dosya seç");
    expect(html).toContain('type="file" accept="image/*"');
    expect(html).toContain("veya HTTPS görsel adresi");
    expect(html).toContain("Bu model: JPEG, PNG, AVIF veya HEIC/HEIF");
    // The run starts disabled until the spend is confirmed.
    expect(html.match(/<button[^>]*type="submit"[^>]*>/)?.[0]).toContain('disabled=""');
    expect(html).toContain("Sonuçlar");
    expect(html).toContain("Çalıştırma ilerlemesi");
  });

  it("keeps audio inputs as addresses and never turns them into an image uploader", () => {
    const html = render(createElement(LabWorkbench, { userId: "admin-a", initialModelKey: "f5-tts" }), "en");
    expect(html.match(/<input[^>]*id="lab-ref_audio_url"[^>]*>/)?.[0]).toContain('type="url"');
    expect(html).toContain("Reference audio URL");
    expect(html).not.toContain("Drag and drop");
    expect(html).not.toContain('type="file"');
  });

  it("takes several images in a list field and one per named view", () => {
    const multi = render(createElement(LabWorkbench, { userId: "admin-a", initialModelKey: "trellis-v1" }));
    expect(multi).toContain("Görselleri sürükleyip bırakın");
    expect(multi).toContain("0 / 4 görsel");
    expect(multi).toContain('type="file" accept="image/*" multiple=""');

    const tryOn = render(createElement(LabWorkbench, { userId: "admin-a", initialModelKey: "fashn-tryon" }));
    expect(tryOn.match(/<fieldset/g)).toHaveLength(2);
    expect(tryOn).toContain("Kişi görseli *");
    expect(tryOn).toContain("Giysi görseli *");

    const fill = render(createElement(LabWorkbench, { userId: "admin-a", initialModelKey: "flux-fill" }));
    expect(fill).toContain("Maske görseli *");
    expect(fill).toContain("<textarea");
  });
});
