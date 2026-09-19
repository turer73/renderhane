"use client";
/* Native React preview, not an iframe. No job submission or payment actions. */
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Box } from "lucide-react";
import { MODELS, TOOL_MODELS } from "@/lib/fal/models";
import { loginPath, photoModelOptions, quoteCredits, type Locale } from "@/lib/launch-preview/core";
import { LaunchNavigation } from "./launch-navigation";
import { Footer } from "@/components/landing/footer";
import { previewHome } from "@/lib/launch-preview/routes";
import "./launch.css";
import "./tools.css";
import "./preview-dark.css";

const Viewer = dynamic(() => import("./product-model-viewer"), {
  ssr: false,
  loading: () => (
    <div className="rhl-loading" role="status">
      3D…
    </div>
  ),
});
/* Baglamsal mobil islem cubugu: yalniz heroyu gecince; form, klavye ve modal sirasinda gizli. */
function MobileDock({ locale }: { locale: Locale }) {
  const tr = locale === "tr";
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const hero = document.querySelector(".rhl-hero-actions");
    if (!hero) return;
    let heroVisible = true;
    const mq = window.matchMedia("(max-width: 767px)");
    const refresh = () => {
      const active = document.activeElement;
      const editing = active instanceof Element && !!active.closest('input,textarea,select,[contenteditable="true"]');
      const modal = !!document.querySelector("dialog[open]");
      const keyboard = window.visualViewport ? window.innerHeight - window.visualViewport.height > 150 : false;
      setVisible(mq.matches && !heroVisible && !editing && !modal && !keyboard);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        heroVisible = entries[0].isIntersecting;
        refresh();
      },
      { threshold: 0 },
    );
    observer.observe(hero);
    const mutations = new MutationObserver(refresh);
    mutations.observe(document.body, {
      attributes: true,
      attributeFilter: ["open"],
      subtree: true,
    });
    mq.addEventListener("change", refresh);
    document.addEventListener("focusin", refresh);
    document.addEventListener("focusout", () => queueMicrotask(refresh));
    window.visualViewport?.addEventListener("resize", refresh);
    refresh();
    return () => {
      observer.disconnect();
      mutations.disconnect();
      mq.removeEventListener("change", refresh);
      document.removeEventListener("focusin", refresh);
      window.visualViewport?.removeEventListener("resize", refresh);
    };
  }, []);
  return (
    <div className="rhl-mobile-dock" hidden={!visible} aria-label={tr ? "Hızlı işlemler" : "Quick actions"}>
      <Link className="rhl-btn" href={loginPath(locale, "img-to-3d")}>
        {tr ? "3D model oluştur" : "Create a 3D model"} <span aria-hidden="true">→</span>
      </Link>
      <a href="#rhl-free">{tr ? "Ücretsiz araçlar" : "Free tools"}</a>
    </div>
  );
}
/* Anasayfa govdesi: onizleme ve uretimde ortak. production=true ise arac
   kartlari gercek sayfalara, sanatsal serit iletisime baglanir. */
export function LaunchPreviewSections({ locale, production = false }: { locale: Locale; production?: boolean }) {
  const tr = locale === "tr";
  const [enabled, setEnabled] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [resetKey, setReset] = useState(0);
  const options = useMemo(() => photoModelOptions(MODELS, TOOL_MODELS["3d-model"], locale), [locale]);
  const [choice, setChoice] = useState("");
  const [count, setCount] = useState("1");
  const selected = options.find((m) => m.key === choice);
  let total: number | null = null;
  if (selected) {
    try {
      total = quoteCredits(selected.credits, Number(count));
    } catch {
      /* explicit validation below */
    }
  }
  const links = {
    model: loginPath(locale, "img-to-3d"),
    scene: loginPath(locale, "scene"),
    video: loginPath(locale, "image-to-video"),
  };
  const toolHref = (slug: string) => (production ? `/${locale}/araclar/${slug}` : `${previewHome(locale)}/araclar/${slug}`);
  const artisticHref = production ? `/${locale}/iletisim` : `${previewHome(locale)}/araclar/sanatsal-qr`;
  const body = (
    <>
      <section className="rhl-hero" aria-labelledby="rhl-title">
        <div>
          <div className="rhl-kicker">
            3D · {tr ? "Görsel" : "Image"} · {tr ? "Video üretimi" : "Video creation"}
          </div>
          <h1 id="rhl-title">
            {tr ? "Fotoğraftan" : "From photo to"}
            <span className="rhl-highlight">{tr ? "3D Model," : "3D Model,"}</span>
            {tr ? "Sahne ve" : "Scenes and"}
            <br />
            {tr ? "Video Üretin" : "Video."}
          </h1>
          <p className="rhl-lead">{tr ? "Ürününü, tasarımını veya fikrini farklı açılardan göster. 3D modelden ürün sahnesine, üretmek istediğin içerikle başla." : "Show your product, design or idea from new angles. Start with the content you need, from 3D models to product scenes."}</p>
          <div className="rhl-hero-actions">
            <Link href={links.model} className="rhl-btn">
              {tr ? "3D model oluştur" : "Create a 3D model"} <ArrowRight size={16} />
            </Link>
            <a href="#rhl-example" className="rhl-btn secondary">
              {tr ? "Örneği incele" : "Explore the example"}
            </a>
          </div>
          <p className="rhl-under">{tr ? "Üretim için giriş gerekir. Kredi maliyeti seçilen modele göre değişir." : "Sign-in is required to generate. Credit cost depends on the model."}</p>
          <div className="rhl-small-chips">
            <span>{tr ? "Fotoğraf → 3D" : "Photo → 3D"}</span>
            <span>{tr ? "Ürün sahneleri" : "Product scenes"}</span>
            <span>{tr ? "Tanıtım videoları" : "Product videos"}</span>
          </div>
        </div>
        <div id="rhl-example" tabIndex={-1}>
          <span id="demo" className="rhl-anchor-alias" aria-hidden="true" />
          <div className="rhl-workspace">
            <div className="rhl-work-head">
              <span className="rhl-work-title">
                <span className="rhl-dot" />
                {tr ? "BİR FOTOĞRAFTAN YENİ BİR BOYUTA" : "FROM A PHOTO TO A NEW DIMENSION"}
              </span>
              <span className="rhl-record-badge">{tr ? "Mevcut demo dosyaları" : "Existing demo assets"}</span>
            </div>
            <div className="rhl-work-content">
              <figure className="rhl-photo">
                <Image src="/demo/original.png" width={320} height={350} alt={tr ? "Mevcut demodaki kaynak ayakkabı görseli" : "Source shoe image from existing demo"} />
                <figcaption>{tr ? "Kaynak görsel" : "Source image"}</figcaption>
              </figure>
              <span className="rhl-flow-arrow" aria-hidden="true">
                →
              </span>
              <div className="rhl-model">
                <span className="rhl-model-label">{tr ? "3D MODEL" : "3D MODEL"} · GLB</span>
                {!enabled ? (
                  <>
                    <Image src="/demo/renderhane.png" className="rhl-model-poster" width={500} height={500} alt={tr ? "Mevcut modelin poster önizlemesi" : "Existing model poster"} />
                    <div className="rhl-start-overlay">
                      <button className="rhl-btn" type="button" onClick={() => setEnabled(true)}>
                        {tr ? "3D modeli aç" : "Open 3D model"} <Box size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <Viewer locale={locale} rotating={rotating} resetKey={resetKey} />
                )}
              </div>
            </div>
            <div className="rhl-work-foot">
              <span>{tr ? "GLB · Etkileşimli önizleme" : "GLB · Interactive preview"}</span>
              <div className="rhl-controls">
                <button className="rhl-quiet-btn" type="button" disabled={!enabled} onClick={() => setRotating(!rotating)}>
                  {tr ? (rotating ? "Dönüşü durdur" : "Otomatik döndür") : rotating ? "Pause rotation" : "Auto rotate"}
                </button>
                <button type="button" className="rhl-quiet-btn" disabled={!enabled} onClick={() => setReset((n) => n + 1)}>
                  {tr ? "Sıfırla" : "Reset"}
                </button>
                <button type="button" className="rhl-quiet-btn" disabled={!enabled} onClick={() => setEnabled(false)}>
                  {tr ? "Kapat" : "Close"}
                </button>
              </div>
            </div>
          </div>
          <p className="rhl-work-note">{tr ? "Sitedeki mevcut görsel ve model kullanılır. Bu örnek için üretim kaydı, ürün doğruluğu ve fiziksel baskı uygunluğu henüz doğrulanmadı." : "Uses the existing site image and model. Generation provenance, product accuracy and physical printability are not yet verified."}</p>
        </div>
      </section>
      <div className="rhl-steps">
        {(tr
          ? [
              ["Fotoğrafını seç", "Tek veya desteklenen çoklu açıyla başla."],
              ["Ne üreteceğini belirle", "3D, sahne veya video; modeli ve krediyi gör."],
              ["Sonucu incele", "Detayları kontrol et, uygun dosyayı indir."],
            ]
          : [
              ["Choose your photo", "Start with one or supported multiple views."],
              ["Choose what to create", "3D, scene or video. Check model and credits."],
              ["Inspect the result", "Check the details and download the output."],
            ]
        ).map(([title, desc], i) => (
          <div key={title} className="rhl-step">
            <span className="rhl-step-num">0{i + 1}</span>
            <div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          </div>
        ))}
      </div>
      <section className="rhl-section" id="rhl-paths" tabIndex={-1}>
        <span id="features" className="rhl-anchor-alias" aria-hidden="true" />
        <div className="rhl-section-head">
          <div>
            <span className="rhl-label">{tr ? "ÜRETİME ODAKLAN" : "FOCUS ON CREATING"}</span>
            <h2>{tr ? "Ne üretmek istiyorsun?" : "What do you want to create?"}</h2>
          </div>
          <p>{tr ? "Önce çıktını seç. Araçlar, işini tamamlamak için yanında." : "Choose the output first. Tools help you complete the task."}</p>
        </div>
        <div className="rhl-routes">
          {[
            {
              key: "model",
              art: "/launch-preview/home/route-3d.webp",
              title: tr ? "3D model" : "3D model",
              desc: tr ? "Formu farklı açılardan incele. Tasarım ve üretim hedefin için modeli değerlendir." : "Inspect the form from different angles. Evaluate it for your design and production needs.",
              cta: tr ? "3D üretime geç" : "Create in 3D",
            },
            {
              key: "scene",
              art: "/launch-preview/home/route-scene.webp",
              title: tr ? "Ürün sahnesi" : "Product scene",
              desc: tr ? "Ürün fotoğrafını farklı ortam ve kompozisyonlarda sun." : "Present your product photo in different settings and compositions.",
              cta: tr ? "Sahne oluşturmaya geç" : "Create a scene",
            },
            {
              key: "video",
              art: "/launch-preview/home/route-video.webp",
              title: tr ? "Tanıtım videosu" : "Product video",
              desc: tr ? "Görselini hareketle anlat. Ürünün için yeni bir tanıtım içeriği hazırla." : "Tell the story with motion. Prepare new promotional content for your product.",
              cta: tr ? "Video oluşturmaya geç" : "Create a video",
            },
          ].map(({ key, art, title, desc, cta }) => (
            <article className={`rhl-route rhl-route-visual ${key === "model" ? "featured" : ""}`} key={key}>
              <div className="rhl-route-art" aria-hidden="true">
                <Image src={art} width={720} height={600} loading="lazy" alt="" />
              </div>
              <div className="rhl-route-body">
                <h3>{title}</h3>
                <p>{desc}</p>
                <Link className="rhl-text-link" href={links[key as keyof typeof links]}>
                  {cta} →
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section id="rhl-cost" className="rhl-estimator" tabIndex={-1}>
        <div>
          <span id="pricing" className="rhl-anchor-alias" aria-hidden="true" />
          <span className="rhl-label">{tr ? "MODELE GÖRE KREDİ" : "MODEL-BASED CREDITS"}</span>
          <h2>{tr ? "Önce maliyetini gör." : "See the cost first."}</h2>
          <p>{tr ? "Her 3D model aynı krediyle çalışmaz. Model ve işlem adedini seç; tahmini kredi ihtiyacını gör." : "3D models do not all use the same credits. Choose a model and generation count to see an estimate."}</p>
          <p>{tr ? "Bu alan kredi satın almaz ve üretim başlatmaz." : "This calculator does not purchase credits or start generation."}</p>
        </div>
        <div>
          <div className="rhl-fields">
            <label>
              {tr ? "3D modeli" : "3D model"}
              <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="">{tr ? "Model seçin" : "Choose a model"}</option>
                {options.map((o) => (
                  <option value={o.key} key={o.key}>
                    {o.label} · {o.credits} {tr ? "kredi" : "credits"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr ? "İşlem adedi" : "Count"}
              <input type="number" min={1} max={100} step={1} value={count} onChange={(e) => setCount(e.target.value)} />
            </label>
          </div>
          <div className="rhl-total">
            <span>{tr ? "Tahmini toplam" : "Estimated total"}</span>
            <output aria-live="polite">{total === null ? "—" : `${total} ${tr ? "kredi" : "credits"}`}</output>
          </div>
          {selected && total === null && (
            <p className="rhl-warning" role="alert">
              {tr ? "1–100 arasında tam sayı girin." : "Enter an integer from 1 to 100."}
            </p>
          )}
          <p>{tr ? "Değerler mevcut model kaydından okunur. Yeniden üretimler ek kredi gerektirebilir. Kesin bedel işlem onayında gösterilmelidir." : "Values come from the existing model registry. Regeneration may require more credits. Confirm the exact cost before submitting."}</p>
        </div>
      </section>
      <section className="rhl-section" id="rhl-free" tabIndex={-1}>
        <div className="rhl-section-head">
          <div>
            <span className="rhl-label">{tr ? "YARDIMCI ARAÇLAR" : "SUPPORTING TOOLS"}</span>
            <h2>{tr ? "Küçük işler de burada." : "The smaller tasks, too."}</h2>
          </div>
          <p>{tr ? "Ücretsiz yardımcılar ayrı; 3D, sahne ve video üretimi krediyle." : "Free utilities are separate from credit-based 3D, scene and video generation."}</p>
        </div>
        <div className="rhl-tool-row rhl-tool-row-visual">
          {[
            ["arka-plan-kaldirma", "/launch-preview/home/tool-bg-remove.webp", tr ? "Ücretsiz" : "Free", tr ? "Arka plan kaldır" : "Remove background", tr ? "Kayıt olmadan · Günde 3 hak" : "No signup · 3 per day"],
            ["qr-kod", "/launch-preview/home/tool-qr.webp", tr ? "Şekilli QR" : "Shaped QR", tr ? "Standart QR oluştur" : "Create a standard QR", tr ? "Ücretsiz · PNG ve SVG" : "Free · PNG and SVG"],
            ["nfc-yaz", "/launch-preview/home/tool-nfc.webp", tr ? "Mobil" : "Mobile", tr ? "NFC etiketi yaz" : "Write an NFC tag", tr ? "Uyumlu Android + Chrome" : "Compatible Android + Chrome"],
          ].map(([slug, art, badge, title, sub]) => (
            <Link className="rhl-tool rhl-tool-visual" href={toolHref(slug)} key={slug}>
              <Image className="rhl-tool-art" src={art} width={240} height={224} loading="lazy" alt="" aria-hidden="true" />
              <div className="rhl-tool-copy">
                <span className="rhl-tool-badge">{badge}</span>
                <b>{title}</b>
                <small>{sub}</small>
              </div>
              <span className="rhl-tool-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          ))}
        </div>
        <div className="rhl-artistic-strip">
          <span className="rhl-strip-icon">
            <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
              <path d="m14 6 4-4a2.1 2.1 0 0 1 3 3l-9 9-3-3 5-5Z" />
              <path d="M10 13c-5-2-2 6-8 7 6 2 10 0 10-5" />
            </svg>
          </span>
          <p>
            {tr ? "Markana özel bir tasarım mı? " : "Looking for a branded design? "}
            <Link href={artisticHref}>
              {tr ? "Sanatsal QR çalışmalarını incele" : "Explore artistic QR"} <span className="rhl-paid-tag">{tr ? "Ücretli özel tasarım" : "Paid design"}</span> <span aria-hidden="true">→</span>
            </Link>
          </p>
        </div>
        <details className="rhl-audit-note" id="rhl-scope">
          <summary>{tr ? "Araç ve servis durumu" : "Tool and service status"}</summary>
          <p>{tr ? "Yeni ana sayfa ve araç ekranları aynı arayüzü kullanır. Standart QR tarayıcıda üretilir. AI üretim ve sipariş servisleri varsayılan olarak bağlı değildir. Şişe örneği önceden hazırlanmıştır. NFC fiziksel cihazda test edilmedi." : "The new homepage and tool screens use one interface. Standard QR generation runs locally. Live AI and order services are not connected by default. The bottle sample is prebuilt. NFC hardware is not tested."}</p>
        </details>
      </section>
    </>
  );
  const inner = (
    <>
      <a className="rhl-skip" href="#rhl-main">
        {tr ? "İçeriğe geç" : "Skip to content"}
      </a>
      <main id="rhl-main">{body}</main>
      <MobileDock locale={locale} />
    </>
  );
  return inner;
}
export function LaunchPreview({ locale, production = false }: { locale: Locale; production?: boolean }) {
  const tr = locale === "tr";
  return (
    <>
      <div className="rhl">
        {!production && <div className="rhl-notice">{tr ? "TASARIM ÖNİZLEMESİ · 3D ana sayfa + V3 araçları · Canlı site değiştirilmedi" : "DESIGN PREVIEW · 3D homepage + V3 tools · Production unchanged"}</div>}
        <div className="rhl-shell">
          <LaunchNavigation locale={locale} production={production} />
          <LaunchPreviewSections locale={locale} production={production} />
        </div>
      </div>
      <div className="rhl-footer-clearance">
        <Footer />
      </div>
    </>
  );
}
