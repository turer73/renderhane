"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { WORKSHOP_LAYERS, WORKSHOP_MAX_BODY, type WorkshopLayer, type WorkshopRevision } from "@/lib/relief/workshop";
import { startWorkshopPolling } from "@/lib/relief/workshop-polling";

const API = "/api/relief/workshop";
const labels: Record<WorkshopLayer, string> = {
  relief_map: "16-bit mutlak yükseklik haritası *", mask: "Siluet — 0/255 gri maske *",
  uv_artwork: "UV renk — RGB / RGBA", white_mask: "White — gri mürekkep kapsamı",
  varnish_mask: "Varnish — gri mürekkep kapsamı",
  geometry_semantic_ids: "Geometri semantik ID — 8/16-bit gri PNG",
  artwork_semantic_ids: "Artwork semantik ID — 8/16-bit gri PNG",
};
const states = { queued: "Sırada", running: "Geometri doğrulanıyor", completed: "Dijital işlem bitti", failed: "İşlem başarısız" };
const errorLabels: Record<string, string> = {
  pilot_storage_byte_limit: "Pilotun 8 GB saklama sınırına ulaşıldı. Kanıtları yedekleyip operatör bakımı yapın.",
  output_storage_limit: "Çıktı/disk güvenlik sınırına ulaşıldı. Kayıtlı kanıtlar otomatik silinmedi.",
  invalid_workshop_input: "Girdi sınırları karşılanmadı. PNG bit derinliğini, ortak canvas boyutunu, maskeleri, dosya boyutunu ve reçete aralığını kontrol edin.",
  invalid_submission_or_artifact: "Girdi veya dosya bütünlüğü doğrulanamadı. Katmanların geçerli PNG olduğundan emin olun.",
  engine_changed_create_revision: "Motor sürümü değişmiş. Aynı kaynakları yeniden göndererek yeni revizyon oluşturun; eski revizyon değiştirilmeyecek.",
  workshop_not_configured: "Worker bağlantısı henüz yapılandırılmadı.",
  workshop_unavailable: "Worker'a ulaşılamıyor. Kayıtlı işler silinmedi; bağlantıyı kontrol edin.",
  authentication_required: "Oturum süresi dolmuş. Tekrar giriş yapın.", admin_required: "Bu atölye yalnız yöneticilere açık.",
  request_limit_4MB: "İstek 4 MB sınırını aşıyor. PNG dosyalarının toplamını 2,9 MB altında tutun.",
  geometry_or_input_validation_failed: "Girdi veya geometri doğrulanamadı. Siluetin tek parça ve deliksiz olduğunu, ince çıkıntıları ve katmanları kontrol edin.",
  worker_interrupted_limit: "İş üç kesinti sonrası durduruldu. Worker sağlığını kontrol edin.",
  build_timeout: "İş 15 dakikalık güvenlik sınırına ulaştı.",
  worker_io_failure: "Worker disk/işlem hatası. Depolamayı kontrol edin.",
  insufficient_disk_space: "Worker'da en az 2 GB boş alan gerekiyor.",
  same_origin_required: "Güvenlik kontrolü isteği reddetti. Sayfayı kendi Renderhane adresinden yeniden açın.",
  invalid_worker_response: "Worker yanıtı doğrulanamadı. Kayıtlar boş veya tamamlanmış sayılmadı; bağlantıyı kontrol edin.",
  invalid_worker_artifact: "Dosyanın türü, boyutu veya hash bilgisi doğrulanamadı. İndirme başlatılmadı.",
  retry_unavailable: "Bu revizyon şu anda tekrar denenemiyor. Durumu yenileyin veya yeni bir revizyon oluşturun.",
};
const genericError = "Atölye isteği güvenle tamamlanamadı. Kayıtlı revizyonlar değiştirilmedi; bağlantıyı kontrol edip yeniden deneyin.";
export const LEGACY_CUT_CONTOUR_WARNING = "Bu eski revizyonda kesim konturu SVG’si bulunmuyor. Bu kayıt üretim adayı değildir; kesim konturu olan yeni bir revizyon oluşturun.";

export function workshopErrorMessage(code: unknown) {
  return typeof code === "string" ? errorLabels[code] ?? genericError : genericError;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Reject proxy/HTML/corrupt JSON before it can be treated as a UI state. */
export async function readWorkshopUiJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const data = record(await response.json());
    if (!data) throw new Error("invalid_worker_response");
    return data;
  } catch {
    throw new Error(workshopErrorMessage("invalid_worker_response"));
  }
}

function revisionsFromReply(data: Record<string, unknown>): WorkshopRevision[] {
  if (!Array.isArray(data.revisions) || typeof data.worker_online !== "boolean" ||
    !data.revisions.every((revision) => {
      const item = record(revision);
      return typeof item?.id === "string" && typeof item.state === "string";
    })) throw new Error(workshopErrorMessage("invalid_worker_response"));
  return data.revisions as WorkshopRevision[];
}

function revisionIdFromReply(data: Record<string, unknown>): string {
  const revision = record(data.revision);
  if (typeof revision?.id !== "string") throw new Error(workshopErrorMessage("invalid_worker_response"));
  return revision.id;
}
const artifactUrl = (id: string, name: string) => `${API}/${id}/artifacts/${name}`;

async function asBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });
}

export function ReliefWorkshop({ configured }: { configured: boolean }) {
  const [revisions, setRevisions] = useState<WorkshopRevision[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(configured);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"sample" | "upload">("sample");
  const [opacity, setOpacity] = useState(45);
  const [overlayLayer, setOverlayLayer] = useState("uv-artwork");
  const [acknowledged, setAcknowledged] = useState(false);
  const mounted = useRef(true);
  const formRef = useRef<HTMLFormElement>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch(API, { cache: "no-store", signal });
    const data = await readWorkshopUiJson(res);
    if (!res.ok) throw new Error(workshopErrorMessage(data.error));
    const revisions = revisionsFromReply(data);
    if (!mounted.current) return false;
    setRevisions(revisions);
    setOnline(data.worker_online === true);
    setConnectionError(null);
    setSelectedId((current) => current ?? revisions[0]?.id ?? null);
    return revisions.some((revision) => revision.state === "queued" || revision.state === "running");
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!configured) return;
    const controller = new AbortController();
    const stopPolling = startWorkshopPolling({
      isVisible: () => document.visibilityState !== "hidden",
      refresh: () => refresh(controller.signal),
      onError: (err) => {
        if (!controller.signal.aborted) {
          setOnline(false);
          setConnectionError(err instanceof Error ? err.message : genericError);
        }
      },
      onSettled: () => { if (!controller.signal.aborted) setLoading(false); },
      addVisibilityListener: (listener) => document.addEventListener("visibilitychange", listener),
      removeVisibilityListener: (listener) => document.removeEventListener("visibilitychange", listener),
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: (timer) => clearTimeout(timer),
    });
    return () => { mounted.current = false; controller.abort(); stopPolling(); };
  }, [configured, refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !acknowledged) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const form = new FormData(event.currentTarget);
      const payload: Record<string, unknown> = {
        acknowledge_candidate: true,
        recipe: { width_mm: Number(form.get("width_mm")), relief_depth_mm: Number(form.get("relief_depth_mm")) },
      };
      if (mode === "sample") payload.sample = "calibration-v1";
      else {
        const entries = WORKSHOP_LAYERS.map((role) => [role, form.get(role)] as const)
          .filter((entry): entry is readonly [WorkshopLayer, File] => entry[1] instanceof File && entry[1].size > 0);
        const manifestFile = form.get("semantic_manifest");
        const semanticEntries = entries.filter(([role]) => role.endsWith("semantic_ids"));
        const hasManifest = manifestFile instanceof File && manifestFile.size > 0;
        if ((semanticEntries.length !== 0 && semanticEntries.length !== 2) || (semanticEntries.length === 2) !== hasManifest) {
          throw new Error("Semantik doğrulama için iki ID PNG'si ve manifest JSON birlikte gerekir.");
        }
        const totalBytes = entries.reduce((sum, [, file]) => sum + file.size, 0) + (hasManifest ? manifestFile.size : 0);
        if (totalBytes > 2_900_000) throw new Error(errorLabels.request_limit_4MB);
        payload.layers = Object.fromEntries(await Promise.all(entries.map(async ([role, file]) => [role, await asBase64(file)])));
        if (hasManifest) {
          try {
            const parsed = JSON.parse(await manifestFile.text());
            if (!record(parsed)) throw new Error("invalid manifest");
            payload.semantic_manifest = parsed;
          } catch {
            throw new Error("Semantik manifest geçerli bir JSON nesnesi olmalı.");
          }
        }
      }
      const body = JSON.stringify(payload);
      if (new TextEncoder().encode(body).byteLength > WORKSHOP_MAX_BODY) throw new Error(errorLabels.request_limit_4MB);
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const data = await readWorkshopUiJson(res);
      if (!res.ok) throw new Error(workshopErrorMessage(data.error));
      setSelectedId(revisionIdFromReply(data));
      setNotice(data.deduplicated ? "Aynı kaynak ve reçete zaten kayıtlı; mevcut revizyon açıldı. Yeni iş veya ücret oluşmadı." : "Değişmez revizyon kaydedildi. Sayfayı kapatsanız da worker kuyruğu devam eder.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gönderim tamamlanamadı.");
    } finally { setBusy(false); }
  }

  async function retry(id: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API}/${id}/retry`, { method: "POST" });
      const data = await readWorkshopUiJson(res);
      if (!res.ok) throw new Error(workshopErrorMessage(data.error));
      revisionIdFromReply(data);
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Tekrar deneme başarısız."); }
    finally { setBusy(false); }
  }

  const selected = revisions.find((revision) => revision.id === selectedId);
  const result = selected?.result;
  const shownLayer = result?.artifacts[overlayLayer] ? overlayLayer : result?.artifacts["uv-artwork"] ? "uv-artwork" : "silhouette";
  const fieldClass = "mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-50";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-300">Kapalı mühendislik pilotu · Relief Pro</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Test Atölyesi</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Gerçek mm ölçüsü, değişmez kaynaklar ve ölçülebilir dijital kanıt. Dome veya AI GLB dönüştürücüsü değildir.</p>
        </div>
        <span role="status" className="rounded-full border px-3 py-1.5 text-xs">
          {!configured ? "Worker yapılandırılmadı" : loading ? "Bağlantı kontrol ediliyor…" : online ? "Worker bağlı" : "Worker çevrimdışı"}
        </span>
      </header>

      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        Dijital geçiş, üretim onayı değildir. Yerel eşleşme yalnız aynı koordinattaki kararlı semantik ID çiftiyle doğrulanır;
        nihai GLB’den bağımsız ID türetimi hâlâ ayrı kapıdır. P1S / A1 mini baskısı ve gerçek UV/RIP ölçümleri olmadan bu paketler yalnız test adayıdır.
      </div>
      {!configured && <p role="status" className="rounded-xl border p-4 text-sm">Atölye arayüzü hazır; dosya işlemek için kalıcı worker, sunucu bağlantısı ve erişim anahtarı yapılandırılmalı. Hiçbir dosya gönderilmiyor.</p>}
      {error && <p role="alert" className="break-words rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm">{error}</p>}
      {connectionError && <p role="alert" className="rounded-lg border border-amber-500/40 p-3 text-sm">{connectionError}</p>}
      {notice && <p role="status" className="rounded-lg border border-indigo-500/30 p-3 text-sm">{notice}</p>}

      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className="space-y-5 rounded-2xl border bg-card p-5">
          <h2 className="text-lg font-semibold">1. Kaynak ve reçete</h2>
          <form ref={formRef} onSubmit={submit} className="space-y-4">
            <fieldset disabled={busy || !configured} className="space-y-4 disabled:opacity-60">
              <legend className="sr-only">Revizyon girdileri</legend>
              <label className="block text-sm font-medium">Başlangıç
                <select className={fieldClass} value={mode} onChange={(event) => setMode(event.target.value as "sample" | "upload")}>
                  <option value="sample">Sentetik kalibrasyon örneği</option>
                  <option value="upload">Kendi üretim katmanlarım</option>
                </select>
              </label>
              {mode === "sample" ? <p className="text-xs text-muted-foreground">Daire ve ok aynı analitik bölgelerden renklendirilir ve yükseltilir. Müşteri/marka varlığı içermez; gerçek ürün kalitesi kanıtı değildir.</p> : <>
                <p className="text-xs text-muted-foreground">PNG katmanları aynı boyutta, 32–4096 px olmalı. Toplam en fazla 2,9 MB. Beauty render yerine üretim artwork’ü yükleyin. Semantik kontrol isteğe bağlıdır; iki ID PNG dosyası ve manifest birlikte gerekir.</p>
                {WORKSHOP_LAYERS.map((role) => <label key={role} className="block text-sm font-medium">{labels[role]}
                  <input name={role} type="file" accept="image/png" required={role === "relief_map" || role === "mask"} className={`${fieldClass} file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs`} />
                </label>)}
                <label className="block text-sm font-medium">Semantik manifest — JSON
                  <input name="semantic_manifest" type="file" accept="application/json,.json" className={`${fieldClass} file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs`} />
                </label>
              </>}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium">Genişlik (mm)
                  <input name="width_mm" type="number" defaultValue={70} min={20} max={140} step={0.1} required className={fieldClass} />
                </label>
                <label className="text-sm font-medium">Kabartma (mm)
                  <select name="relief_depth_mm" defaultValue="1" className={fieldClass}>
                    {[0.6, 1, 1.4, 1.8].map((depth) => <option key={depth} value={depth}>{depth.toFixed(1)}</option>)}
                  </select>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">Taban 3,0 mm. Yükseklik siluet oranından hesaplanır. Mutlak 16-bit kodlar korunur; grid 256, gamma 1. Mıknatıs cebi bu pilotta yoktur.</p>
              <label className="flex items-start gap-2 text-xs leading-relaxed">
                <input type="checkbox" className="mt-0.5" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} required />
                <span>Kaynakları kullanma iznim var. Çıktının fiziksel üretim onayı olmadığını ve bu pilotta kredi harcanmayacağını anlıyorum.</span>
              </label>
              <Button type="submit" disabled={busy || !acknowledged || !online} className="w-full">{busy ? "Kaydediliyor…" : "Revizyon oluştur ve doğrula"}</Button>
            </fieldset>
          </form>
          <div className="border-t pt-4">
            <h2 className="text-sm font-semibold">Kayıtlı revizyonlar</h2>
            <p className="my-2 text-xs text-muted-foreground">Aynı dosyalar + reçete + motor tek revizyondur. Yenilemek yeni üretim başlatmaz.</p>
            {!revisions.length ? <p className="py-3 text-sm text-muted-foreground">{loading ? "Yükleniyor…" : "Henüz revizyon yok."}</p> :
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {revisions.map((revision) => <li key={revision.id}>
                  <button type="button" aria-pressed={selectedId === revision.id} onClick={() => setSelectedId(revision.id)} className={`w-full rounded-lg border p-3 text-left text-sm ${selectedId === revision.id ? "border-indigo-500 bg-indigo-500/5" : "hover:bg-muted"}`}>
                    <span className="block font-medium">{revision.spec.recipe.width_mm} mm · {revision.spec.recipe.relief_depth_mm} mm kabartma</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{states[revision.state]} · {revision.id.slice(0, 8)}</span>
                  </button>
                </li>)}
              </ul>}
          </div>
        </section>

        <section className="min-w-0 space-y-5 rounded-2xl border bg-card p-5">
          <h2 className="text-lg font-semibold">2. Önizleme ve kanıt</h2>
          {!selected ? <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
            <p className="font-medium">İlk dijital numuneyi oluşturun</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">Final GLB + ayrı artwork katmanlarının ortografik derinliği, silueti ve ölçüm raporları burada görünür.</p>
          </div> : <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{states[selected.state]} · deneme {selected.attempts}/3</span>
              <code className="text-xs text-muted-foreground">{selected.id.slice(0, 8)}</code>
            </div>
            {selected.state === "queued" || selected.state === "running" ? <p role="status" className="rounded-lg bg-muted p-6 text-sm">{online ? "Worker sırayla geometri üretimi, bağımsız export kontrolü ve projeksiyon ölçümünü çalıştırıyor." : "İş diskte kayıtlı. Worker bağlantısı geri geldiğinde kuyruk devam edebilir."} Bu işlem birkaç dakika sürebilir.</p> : null}
            {selected.error && <div role="alert" className="space-y-3 rounded-lg border border-red-500/30 p-4 text-sm">
              <p>{workshopErrorMessage(selected.error)}</p>
              {selected.attempts < 3 && <Button variant="outline" disabled={busy || !online} onClick={() => retry(selected.id)}>Aynı revizyonu tekrar dene</Button>}
            </div>}
            {result && <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Gate label="Dijital geometri" value={result.digital_geometry_status === "ready" ? "Geçti" : result.digital_geometry_status === "failed" ? "Başarısız" : "İnceleme gerekli"} pass={result.digital_geometry_status === "ready"} />
                <Gate
                  label="Semantik ID raster eşleşmesi"
                  value={result.artwork_semantic_registration_status === "validated"
                    ? selected.spec.sample ? "Kalibrasyon ID’leri eşleşti" : "Beyan edilen ID’ler eşleşti"
                    : result.artwork_semantic_registration_status === "failed" ? "Başarısız" : "Doğrulanmadı"}
                  pass={result.artwork_semantic_registration_status === "validated"}
                />
                <Gate label="Fiziksel üretim" value="Onaylanmadı" />
              </div>
              <p className="text-sm">{result.physical_width_mm.toFixed(2)} × {result.physical_height_mm.toFixed(2)} mm · 3 mm taban · {selected.spec.recipe.relief_depth_mm} mm kabartma</p>
              <div className="relative overflow-hidden rounded-xl border bg-neutral-800" style={{ aspectRatio: `${result.physical_width_mm} / ${result.physical_height_mm}` }}>
                <Image src={artifactUrl(selected.id, "depth")} alt="Final GLB'den ortografik yükseklik projeksiyonu" fill unoptimized sizes="(max-width: 1024px) 90vw, 60vw" className="object-contain" />
                <Image src={artifactUrl(selected.id, shownLayer)} alt={`Aynı fiziksel çerçevede ${shownLayer} katmanı`} fill unoptimized sizes="(max-width: 1024px) 90vw, 60vw" className="object-contain" style={{ opacity: opacity / 100 }} />
              </div>
              <label className="block text-xs">Bindirilecek katman
                <select value={shownLayer} onChange={(event) => setOverlayLayer(event.target.value)} className={fieldClass}>
                  {[["uv-artwork", "UV renk"], ["white-mask", "White"], ["varnish-mask", "Varnish"], ["silhouette", "Final siluet"], ["overlay", "Siluet ölçüm overlay'i"], ["difference", "Derinlik fark raporu"]].filter(([key]) => result.artifacts[key]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="block text-xs">Katman görünürlüğü: %{opacity}
                <input type="range" min={0} max={100} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} className="mt-2 w-full" />
              </label>
              <p className="text-xs text-muted-foreground">Görsel bindirme nitel incelemedir. GLB dokusuzdur; renk dosyası GLB’den yeniden üretilmiş albedo değildir. Kesin kontrolleri rapordan okuyun.</p>
              {result.artifacts["semantic-overlay"] && result.artifacts["semantic-difference"] ? <div className="space-y-2">
                <h3 className="text-sm font-medium">Semantik örtüşme kanıtı</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <figure>
                    <div className="relative h-64 overflow-hidden rounded-lg border bg-slate-950">
                      <Image src={artifactUrl(selected.id, "semantic-overlay")} alt="Geometri ve artwork semantik sınır bindirmesi" fill unoptimized sizes="(max-width: 640px) 90vw, 30vw" className="object-contain" />
                    </div>
                    <figcaption className="mt-1 text-xs text-muted-foreground">Sınırlar: kırmızı geometri, camgöbeği artwork, beyaz çakışma.</figcaption>
                  </figure>
                  <figure>
                    <div className="relative h-64 overflow-hidden rounded-lg border bg-slate-950">
                      <Image src={artifactUrl(selected.id, "semantic-difference")} alt="Kararlı semantik ID piksel farkı" fill unoptimized sizes="(max-width: 640px) 90vw, 30vw" className="object-contain" />
                    </div>
                    <figcaption className="mt-1 text-xs text-muted-foreground">Yeşil aynı ID; kırmızı yalnız geometri; mavi yalnız artwork; amber yanlış ID.</figcaption>
                  </figure>
                </div>
              </div> : null}
              <CoverageSummary coverage={result.coverage} />
              {(result.digital_failures.length > 0 || result.digital_warnings.length > 0) && <div className="rounded-lg border border-amber-500/40 p-3 text-sm">
                <h3 className="font-medium">Dijital bulgular</h3>
                <ul className="mt-2 list-inside list-disc break-words text-xs">{[...result.digital_failures, ...result.digital_warnings].map((finding) => <li key={finding}>{finding}</li>)}</ul>
              </div>}
              <div className="flex flex-wrap gap-2">
                <Button asChild><a href={artifactUrl(selected.id, "evidence")}>Test ve ölçüm paketini indir</a></Button>
                {[["model-glb", "GLB"], ["model-stl", "STL"], ["model-3mf", "3MF"], ["registration", "Kayıt JSON"], ["layer-coverage", "Kapsam JSON"], ["semantic-registration", "Semantik kayıt JSON"], ["semantic-overlay", "Semantik overlay PNG"], ["semantic-difference", "Semantik fark PNG"], ["cut-contour", "Kesim konturu SVG"]].filter(([name]) => result.artifacts[name]).map(([name, label]) => <Button asChild variant="outline" key={name}><a href={artifactUrl(selected.id, name)}>{label}</a></Button>)}
              </div>
              {result.artifact_contract_status === "legacy_missing_cut_contour" ? <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">Bu eski revizyonda kesim konturu SVG’si bulunmuyor. Bu kayıt üretim adayı değildir; kesim konturu olan yeni bir revizyon oluşturun.</p> : <p className="text-xs text-muted-foreground">Kesim konturu SVG, değişmez üretim adayındaki artwork/cut-contour.svg ile aynı dosyadır. Final GLB + ayrı artwork katmanları birlikte indirilir; GLB/STL/3MF dosyaları generic geometridir ve yazıcı/filament profili içermez.</p>}
              <details className="rounded-lg border p-3 text-xs">
                <summary className="cursor-pointer font-medium">Revizyon ve dosya parmak izleri</summary>
                <p className="mt-3 break-all">Reçete/kaynak/motor SHA-256: {selected.spec_hash}</p>
                <ul className="mt-3 space-y-2">{Object.entries(result.artifacts).map(([name, artifact]) => <li key={name} className="break-all"><span className="font-medium">{name}</span> · {artifact.bytes.toLocaleString("tr-TR")} byte<br />{artifact.sha256}</li>)}</ul>
              </details>
            </>}
          </>}
          <div className="border-t pt-4 text-sm">
            <h2 className="font-semibold">3. Fiziksel numune kapısı</h2>
            <p className="mt-2 text-muted-foreground">Pakette P1S / A1 mini × 0,6 / 1,0 / 1,4 / 1,8 mm ölçüm CSV’leri bulunur. Kumpas ölçüleri, düz arka yüz, çarpılma, fotoğraf referansları ve gerçek UV kaçıklığı kaydedilmelidir.</p>
            <p className="mt-2 text-xs text-muted-foreground">Bu sürüm fiziksel onay düğmesi sunmaz. Doldurulan şablonlar mevcut fiziksel benchmark aracıyla incelenir; nihai insan onayı ayrıdır.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Gate({ label, value, pass = false }: { label: string; value: string; pass?: boolean }) {
  return <div className={`rounded-lg border p-3 ${pass ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}

function CoverageSummary({ coverage }: { coverage: Record<string, unknown> }) {
  const layers = coverage.layers as Record<string, { status: string; outside_silhouette_pixels?: number; outside_silhouette_area_mm2?: number; max_nearest_silhouette_distance_mm?: number }> | undefined;
  return <div className="overflow-x-auto rounded-lg border p-3">
    <h3 className="text-sm font-medium">Siluet dışına taşan mürekkep kapsamı</h3>
    <p className="mt-1 text-xs text-muted-foreground">İç desen doğruluğunu değil, kaynak siluet sınırını ölçer. Opaque RGB’den baskı kapsamı çıkarılamaz.</p>
    <table className="mt-3 w-full text-left text-xs"><thead><tr><th scope="col" className="pr-2 pb-2">Katman</th><th scope="col" className="pr-2 pb-2">Sonuç</th><th scope="col" className="pr-2 pb-2">Alan (mm²)</th><th scope="col" className="pb-2">En uzak piksel merkezi (mm)</th></tr></thead>
      <tbody>{Object.entries(layers ?? {}).map(([name, layer]) => <tr key={name} className="border-t"><td className="py-2 pr-2">{name}</td><td className="pr-2">{layer.status === "pass" ? "Taşma yok" : layer.status === "fail" ? "Taşma var" : "Ölçülemedi"}</td><td className="pr-2">{layer.outside_silhouette_area_mm2?.toFixed(4) ?? "—"}</td><td>{layer.max_nearest_silhouette_distance_mm?.toFixed(4) ?? "—"}</td></tr>)}</tbody>
    </table>
  </div>;
}
